import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch as UiSwitch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Device } from '@/types';
import { deviceAPI } from '@/services/api';
import { Copy, Check, Eye, EyeOff, Shield } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const switchTypes = ['relay', 'light', 'fan', 'outlet', 'projector', 'ac'] as const;
const blocks = ['A','B','C','D'];
const floors = ['0','1','2','3','4','5'];
const RESERVED = new Set([6,7,8,9,10,11]);
const VALID_PINS = Array.from({length:40}, (_,i)=>i).filter(p=>!RESERVED.has(p));

const switchSchema = z.object({
  id: z.string().optional(), // existing switch id (for matching)
  name: z.string().min(1),
  gpio: z.number().min(0).max(39).refine(p=>!RESERVED.has(p),'Reserved pin (6-11)'),
  type: z.enum(switchTypes),
  icon: z.string().optional(),
  state: z.boolean().default(false),
  manualSwitchEnabled: z.boolean().default(false),
  manualSwitchGpio: z.number().min(0,{message:'Required when manual is enabled'}).max(39).optional().refine(p=>p===undefined || !RESERVED.has(p),'Reserved pin (6-11)'),
  manualMode: z.enum(['maintained','momentary']).default('maintained'),
  manualActiveLow: z.boolean().default(true)
}).refine(s => !s.manualSwitchEnabled || s.manualSwitchGpio !== undefined, {
  message: 'Choose a manual switch GPIO when manual is enabled',
  path: ['manualSwitchGpio']
});

const formSchema = z.object({
  name: z.string().min(1,'Required'),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,'Invalid MAC'),
  ipAddress: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/,'Invalid IP').refine(v=>v.split('.').every(o=>+o>=0 && +o<=255),'Octets 0-255'),
  location: z.string().min(1),
  classroom: z.string().optional(),
  pirEnabled: z.boolean().default(false),
  pirGpio: z.number().min(0).max(39).optional().refine(p=>p===undefined || !RESERVED.has(p),'Reserved pin'),
  pirAutoOffDelay: z.number().min(0).default(30),
  switches: z.array(switchSchema).min(1).max(8).refine(sw=>{
    const prim = sw.map(s=>s.gpio);
    const man = sw.filter(s=>s.manualSwitchEnabled && s.manualSwitchGpio!==undefined).map(s=>s.manualSwitchGpio as number);
    const all=[...prim,...man];
    return new Set(all).size===all.length;
  },{message:'GPIO pins (including manual) must be unique'})
});

type FormValues = z.infer<typeof formSchema>;
interface Props { open:boolean; onOpenChange:(o:boolean)=>void; onSubmit:(d:FormValues)=>void; initialData?:Device }

const parseLocation = (loc?:string)=>{
  if(!loc) return {block:'A', floor:'0'};
  const b = loc.match(/Block\s+([A-Z])/i)?.[1]?.toUpperCase() || 'A';
  const f = loc.match(/Floor\s+(\d+)/i)?.[1] || '0';
  return {block:b,floor:f};
};

export const DeviceConfigDialog: React.FC<Props> = ({open,onOpenChange,onSubmit,initialData}) => {
  const locParts = parseLocation(initialData?.location);
  const [block,setBlock]=useState(locParts.block);
  const [floor,setFloor]=useState(locParts.floor);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      macAddress: initialData.macAddress,
      ipAddress: initialData.ipAddress,
      location: initialData.location || `Block ${locParts.block} Floor ${locParts.floor}`,
      classroom: initialData.classroom || '',
      pirEnabled: initialData.pirEnabled || false,
      pirGpio: initialData.pirGpio,
      pirAutoOffDelay: initialData.pirAutoOffDelay || 30,
      switches: initialData.switches.map((sw:any)=>({
        id: sw.id || sw._id,
        name: sw.name,
        gpio: sw.relayGpio ?? sw.gpio ?? 0,
        type: sw.type || 'relay',
        icon: sw.icon,
        state: !!sw.state,
        manualSwitchEnabled: sw.manualSwitchEnabled || false,
    manualSwitchGpio: sw.manualSwitchGpio,
    manualMode: sw.manualMode || 'maintained',
    manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : true
      }))
    } : {
      name:'', macAddress:'', ipAddress:'', location:`Block ${locParts.block} Floor ${locParts.floor}`, classroom:'', pirEnabled:false, pirGpio:undefined, pirAutoOffDelay:30,
  switches:[{id: undefined, name:'', gpio:0, type:'relay', icon:'lightbulb', state:false, manualSwitchEnabled:false, manualMode:'maintained', manualActiveLow:true}]
    }
  });
  // When switching between devices, reset the form with new defaults so fields are populated
  useEffect(()=>{
    if (initialData && open) {
      const lp = parseLocation(initialData.location);
      setBlock(lp.block); setFloor(lp.floor);
      form.reset({
        name: initialData.name,
        macAddress: initialData.macAddress,
        ipAddress: initialData.ipAddress,
        location: initialData.location || `Block ${lp.block} Floor ${lp.floor}`,
        classroom: initialData.classroom || '',
        pirEnabled: initialData.pirEnabled || false,
        pirGpio: initialData.pirGpio,
        pirAutoOffDelay: initialData.pirAutoOffDelay || 30,
        switches: initialData.switches.map((sw:any)=>({
          id: sw.id || sw._id,
          name: sw.name,
          gpio: sw.relayGpio ?? sw.gpio ?? 0,
          type: sw.type || 'relay',
          icon: sw.icon,
          state: !!sw.state,
          manualSwitchEnabled: sw.manualSwitchEnabled || false,
          manualSwitchGpio: sw.manualSwitchGpio,
          manualMode: sw.manualMode || 'maintained',
          manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : true
        }))
      });
    } else if (!initialData && open) {
      const lp = parseLocation(undefined);
      form.reset({
        name:'', macAddress:'', ipAddress:'', location:`Block ${lp.block} Floor ${lp.floor}`, classroom:'', pirEnabled:false, pirGpio:undefined, pirAutoOffDelay:30,
        switches:[{id: undefined, name:'', gpio:0, type:'relay', icon:'lightbulb', state:false, manualSwitchEnabled:false, manualMode:'maintained', manualActiveLow:true}]
      });
    }
  },[initialData, open]);
  useEffect(()=>{ form.setValue('location', `Block ${block} Floor ${floor}`); },[block,floor]);
  // Secret reveal state
  const [secretPin,setSecretPin] = useState('');
  const [secretLoading,setSecretLoading]=useState(false);
  const [secretValue,setSecretValue]=useState<string|null>(null);
  const [secretError,setSecretError]=useState<string|null>(null);
  const [secretVisible,setSecretVisible]=useState(false);
  const [copied,setCopied]=useState(false);
  const deviceId = (initialData as any)?.id;

  const fetchSecret = async () => {
    if (!deviceId) { setSecretError('No device ID'); return; }
    setSecretLoading(true); setSecretError(null); setCopied(false);
    try {
      const resp = await deviceAPI.getDeviceWithSecret(deviceId, secretPin||undefined);
      const s = resp.data?.deviceSecret || resp.data?.data?.deviceSecret;
      if (!s) {
        setSecretError('Secret not returned');
        return;
      }
      setSecretValue(s);
      setSecretVisible(true);
    } catch (e:any) {
      setSecretError(e?.message || 'Failed');
    } finally { setSecretLoading(false); }
  };

  const copySecret = async () => {
    if (!secretValue) return;
    try { await navigator.clipboard.writeText(secretValue); setCopied(true); setTimeout(()=>setCopied(false),1500);} catch {}
  };
  const submit = (data:FormValues)=>{ onSubmit(data); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData?'Edit Device':'Add New Device'}</DialogTitle>
          <DialogDescription>{initialData?'Update device configuration':'Enter device details and at least one switch.'}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
            <div className="space-y-4">
              <FormField control={form.control} name="name" render={({field}) => (<FormItem><FormLabel>Device Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="macAddress" render={({field}) => (<FormItem><FormLabel>MAC Address</FormLabel><FormControl><Input {...field} placeholder="00:11:22:33:44:55" /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="ipAddress" render={({field}) => (<FormItem><FormLabel>IP Address</FormLabel><FormControl><Input {...field} placeholder="192.168.1.100" /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-2 gap-4">
                <FormItem><FormLabel>Block</FormLabel><Select value={block || ''} onValueChange={v=>setBlock(v)}><FormControl><SelectTrigger><SelectValue placeholder="Block" /></SelectTrigger></FormControl><SelectContent>{blocks.map(b=> <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></FormItem>
                <FormItem><FormLabel>Floor</FormLabel><Select value={floor || ''} onValueChange={v=>setFloor(v)}><FormControl><SelectTrigger><SelectValue placeholder="Floor" /></SelectTrigger></FormControl><SelectContent>{floors.map(f=> <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></FormItem>
              </div>
              <input type="hidden" {...form.register('location')} />
              <FormField control={form.control} name="classroom" render={({field}) => (<FormItem><FormLabel>Classroom (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <Separator />
            {initialData && (
              <div className="space-y-3 p-4 border rounded-md">
                <div className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4" /> Device Secret</div>
                <p className="text-xs text-muted-foreground">Enter admin PIN to generate/reveal the device secret. Keep it confidential.</p>
                <div className="flex items-center gap-2">
                  <Input placeholder="PIN" type="password" value={secretPin} onChange={e=>setSecretPin(e.target.value)} className="max-w-[140px]" />
                  <Button type="button" variant="outline" size="sm" disabled={secretLoading || !secretPin} onClick={fetchSecret}>{secretLoading? 'Loading...' : (secretValue? 'Regenerate' : 'Reveal')}</Button>
                  {secretValue && (
                    <Button type="button" variant="outline" size="icon" onClick={()=>setSecretVisible(v=>!v)}>
                      {secretVisible? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                    </Button>
                  )}
                  {secretValue && (
                    <Button type="button" variant="outline" size="icon" onClick={copySecret}>
                      {copied? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                    </Button>
                  )}
                </div>
                {secretValue && (
                  <div className="text-xs font-mono break-all bg-muted p-2 rounded border select-all">
                    {secretVisible? secretValue : secretValue.replace(/.(?=.{6})/g,'•')}
                  </div>
                )}
                {secretError && <div className="text-xs text-red-500">{secretError}</div>}
              </div>
            )}
            <Separator />
            <div className="space-y-4">
              <FormField control={form.control} name="pirEnabled" render={({field}) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Enable PIR Sensor</FormLabel></FormItem>)} />
              {form.watch('pirEnabled') && (
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="pirGpio" render={({field}) => (<FormItem><FormLabel>PIR GPIO</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} onChange={e=>field.onChange(e.target.value===''?undefined:Number(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="pirAutoOffDelay" render={({field}) => (<FormItem><FormLabel>Auto-off Delay (s)</FormLabel><FormControl><Input type="number" {...field} onChange={e=>field.onChange(Number(e.target.value||0))} /></FormControl><FormMessage /></FormItem>)} />
                </div>
              )}
            </div>
            <Separator />
            <div className="space-y-4">
              {form.watch('switches')?.map((_,idx)=>{
        const switches = form.watch('switches') || [];
                const usedPins = new Set(switches.flatMap((s,i)=>{ const arr=[s.gpio]; if(s.manualSwitchEnabled && s.manualSwitchGpio!==undefined) arr.push(s.manualSwitchGpio); return i===idx?[]:arr; }));
                const primaryAvail = VALID_PINS.filter(p=>!usedPins.has(p) || p===switches[idx].gpio);
                return (
                  <div key={idx} className="grid gap-4 p-4 border rounded-md">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium">Switch {idx+1}</h4>
                      {idx>0 && <Button type="button" variant="destructive" size="sm" onClick={()=>{ const sw=[...switches]; sw.splice(idx,1); form.setValue('switches', sw); }}>Remove</Button>}
                    </div>
          {/* Hidden id field to preserve existing switch identity */}
          { (switches[idx] as any).id && <input type="hidden" value={(switches[idx] as any).id} {...form.register(`switches.${idx}.id` as const)} /> }
                    <FormField control={form.control} name={`switches.${idx}.name`} render={({field}) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Light" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`switches.${idx}.type`} render={({field}) => (<FormItem><FormLabel>Type</FormLabel><Select onValueChange={field.onChange} value={field.value || 'relay'}><FormControl><SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger></FormControl><SelectContent>{switchTypes.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`switches.${idx}.gpio`} render={({field}) => { const list=[...primaryAvail]; if(!list.includes(field.value)) list.push(field.value); list.sort((a,b)=>a-b); return (<FormItem><FormLabel>GPIO Pin</FormLabel><Select value={String(field.value)} onValueChange={v=>field.onChange(Number(v))}><FormControl><SelectTrigger><SelectValue placeholder="GPIO" /></SelectTrigger></FormControl><SelectContent className="max-h-64">{list.map(p=> <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>); }} />
                    <FormField control={form.control} name={`switches.${idx}.manualSwitchEnabled`} render={({field}) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Manual Switch</FormLabel></FormItem>)} />
                    {form.watch(`switches.${idx}.manualSwitchEnabled`) && (
                      <>
                        <FormField control={form.control} name={`switches.${idx}.manualSwitchGpio`} render={({field}) => {
                          const all=form.watch('switches')||[];
                          const used=new Set(all.flatMap((s,i)=>{ const arr=[s.gpio]; if(s.manualSwitchEnabled && s.manualSwitchGpio!==undefined) arr.push(s.manualSwitchGpio); return i===idx?[s.gpio]:arr; }));
                          const avail=VALID_PINS.filter(p=>!used.has(p) || p===field.value);
                          if(field.value!==undefined && !avail.includes(field.value)) avail.push(field.value);
                          avail.sort((a,b)=>a-b);
                          const NONE = '__none__';
                          const currentVal = field.value === undefined ? NONE : String(field.value);
                          return (
                            <FormItem>
                              <FormLabel>Manual Switch GPIO</FormLabel>
                              <Select value={currentVal} onValueChange={v=>field.onChange(v===NONE?undefined:Number(v))}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="GPIO" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-64">
                                  <SelectItem key={NONE} value={NONE}>Select</SelectItem>
                                  {avail.map(p=> (
                                    <SelectItem key={String(p)} value={String(p)}>{p}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          );
                        }} />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField control={form.control} name={`switches.${idx}.manualMode`} render={({field}) => (<FormItem><FormLabel>Manual Mode</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Mode" /></SelectTrigger></FormControl><SelectContent><SelectItem value="maintained">Maintained</SelectItem><SelectItem value="momentary">Momentary</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                          <FormField control={form.control} name={`switches.${idx}.manualActiveLow`} render={({field}) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Active Low</FormLabel></FormItem>)} />
                        </div>
                      </>
                    )}
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={idx===0} onClick={()=>{
                        const swArr=[...form.getValues('switches')];
                        if(idx>0){ const tmp=swArr[idx-1]; swArr[idx-1]=swArr[idx]; swArr[idx]=tmp; form.setValue('switches', swArr); }
                      }}>Up</Button>
                      <Button type="button" variant="outline" size="sm" disabled={idx===switches.length-1} onClick={()=>{
                        const swArr=[...form.getValues('switches')];
                        if(idx<swArr.length-1){ const tmp=swArr[idx+1]; swArr[idx+1]=swArr[idx]; swArr[idx]=tmp; form.setValue('switches', swArr); }
                      }}>Down</Button>
                    </div>
                  </div>
                );
              })}
  <Button type="button" variant="outline" onClick={()=>{ const sw=form.getValues('switches')||[]; form.setValue('switches',[...sw,{id: undefined,name:'',gpio:0,type:'relay',icon:'lightbulb',state:false,manualSwitchEnabled:false, manualMode:'maintained', manualActiveLow:true}]); }}>Add Switch</Button>
  {/* Added manualMode/manualActiveLow defaults when adding a new switch */}
  {/* NOTE: Above Add Switch handler updated to include them if needed */}
            </div>
            <DialogFooter><Button type="submit">Save Changes</Button></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
