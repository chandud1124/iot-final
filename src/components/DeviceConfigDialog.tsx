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
import { Separator } from '@/components/ui/separator';

const switchTypes = ['relay', 'light', 'fan', 'outlet', 'projector', 'ac'] as const;
const blocks = ['A','B','C','D'];
const floors = ['0','1','2','3','4','5'];
const RESERVED = new Set([6,7,8,9,10,11]);
const VALID_PINS = Array.from({length:40}, (_,i)=>i).filter(p=>!RESERVED.has(p));

const switchSchema = z.object({
  name: z.string().min(1),
  gpio: z.number().min(0).max(39).refine(p=>!RESERVED.has(p),'Reserved pin (6-11)'),
  type: z.enum(switchTypes),
  icon: z.string().optional(),
  manualSwitchEnabled: z.boolean().default(false),
  manualSwitchGpio: z.number().min(0).max(39).optional().refine(p=>p===undefined || !RESERVED.has(p),'Reserved pin (6-11)')
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
        name: sw.name,
        gpio: sw.relayGpio ?? sw.gpio ?? 0,
        type: sw.type || 'relay',
        icon: sw.icon,
        manualSwitchEnabled: sw.manualSwitchEnabled || false,
        manualSwitchGpio: sw.manualSwitchGpio
      }))
    } : {
      name:'', macAddress:'', ipAddress:'', location:`Block ${locParts.block} Floor ${locParts.floor}`, classroom:'', pirEnabled:false, pirGpio:undefined, pirAutoOffDelay:30,
      switches:[{name:'', gpio:0, type:'relay', icon:'lightbulb', manualSwitchEnabled:false}]
    }
  });
  useEffect(()=>{ form.setValue('location', `Block ${block} Floor ${floor}`); },[block,floor]);
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
                <FormItem><FormLabel>Block</FormLabel><Select value={block} onValueChange={v=>setBlock(v)}><FormControl><SelectTrigger><SelectValue placeholder="Block" /></SelectTrigger></FormControl><SelectContent>{blocks.map(b=> <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></FormItem>
                <FormItem><FormLabel>Floor</FormLabel><Select value={floor} onValueChange={v=>setFloor(v)}><FormControl><SelectTrigger><SelectValue placeholder="Floor" /></SelectTrigger></FormControl><SelectContent>{floors.map(f=> <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></FormItem>
              </div>
              <input type="hidden" {...form.register('location')} />
              <FormField control={form.control} name="classroom" render={({field}) => (<FormItem><FormLabel>Classroom (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <Separator />
            <div className="space-y-4">
              <FormField control={form.control} name="pirEnabled" render={({field}) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Enable PIR Sensor</FormLabel></FormItem>)} />
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
                    <FormField control={form.control} name={`switches.${idx}.name`} render={({field}) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Light" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`switches.${idx}.type`} render={({field}) => (<FormItem><FormLabel>Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger></FormControl><SelectContent>{switchTypes.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name={`switches.${idx}.gpio`} render={({field}) => { const list=[...primaryAvail]; if(!list.includes(field.value)) list.push(field.value); list.sort((a,b)=>a-b); return (<FormItem><FormLabel>GPIO Pin</FormLabel><Select value={String(field.value)} onValueChange={v=>field.onChange(Number(v))}><FormControl><SelectTrigger><SelectValue placeholder="GPIO" /></SelectTrigger></FormControl><SelectContent className="max-h-64">{list.map(p=> <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>); }} />
                    <FormField control={form.control} name={`switches.${idx}.manualSwitchEnabled`} render={({field}) => (<FormItem className="flex items-center gap-2"><FormControl><UiSwitch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Manual Switch</FormLabel></FormItem>)} />
                    {form.watch(`switches.${idx}.manualSwitchEnabled`) && (
                      <FormField control={form.control} name={`switches.${idx}.manualSwitchGpio`} render={({field}) => { const all=form.watch('switches')||[]; const used=new Set(all.flatMap((s,i)=>{ const arr=[s.gpio]; if(s.manualSwitchEnabled && s.manualSwitchGpio!==undefined) arr.push(s.manualSwitchGpio); return i===idx?[s.gpio]:arr; })); const avail=VALID_PINS.filter(p=>!used.has(p) || p===field.value); if(field.value!==undefined && !avail.includes(field.value)) avail.push(field.value); avail.sort((a,b)=>a-b); return (<FormItem><FormLabel>Manual Switch GPIO</FormLabel><Select value={field.value===undefined?undefined:String(field.value)} onValueChange={v=>field.onChange(Number(v))}><FormControl><SelectTrigger><SelectValue placeholder="GPIO" /></SelectTrigger></FormControl><SelectContent className="max-h-64">{avail.map(p=> <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>); }} />
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" onClick={()=>{ const sw=form.getValues('switches')||[]; form.setValue('switches',[...sw,{name:'',gpio:0,type:'relay',icon:'lightbulb',manualSwitchEnabled:false}]); }}>Add Switch</Button>
            </div>
            <DialogFooter><Button type="submit">Save Changes</Button></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
