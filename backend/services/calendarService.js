
const axios = require('axios');
const Holiday = require('../models/Holiday');

class CalendarService {
  constructor() {
    this.apiKey = process.env.CALENDAR_API_KEY;
    this.calendarId = process.env.CALENDAR_ID;
  }

  async checkIfHoliday(date) {
    try {
      // Check local database first
      const localHoliday = await Holiday.findOne({
        date: {
          $gte: new Date(date.setHours(0, 0, 0, 0)),
          $lt: new Date(date.setHours(23, 59, 59, 999))
        }
      });

      if (localHoliday) {
        return {
          isHoliday: true,
          name: localHoliday.name,
          type: localHoliday.type,
          source: 'local'
        };
      }

      // Check Google Calendar if API key is provided
      if (this.apiKey && this.calendarId) {
        return await this.checkGoogleCalendar(date);
      }

      return { isHoliday: false };
    } catch (error) {
      console.error('Error checking holiday:', error);
      return { isHoliday: false };
    }
  }

  async checkGoogleCalendar(date) {
    try {
      const startOfDay = new Date(date.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(date.setHours(23, 59, 59, 999)).toISOString();

      const response = await axios.get(
        `https://www.googleapis.com/calendar/v3/calendars/${this.calendarId}/events`,
        {
          params: {
            key: this.apiKey,
            timeMin: startOfDay,
            timeMax: endOfDay,
            singleEvents: true,
            orderBy: 'startTime'
          }
        }
      );

      const events = response.data.items || [];
      const holiday = events.find(event => 
        event.summary && event.summary.toLowerCase().includes('holiday')
      );

      if (holiday) {
        return {
          isHoliday: true,
          name: holiday.summary,
          type: 'google',
          source: 'google_calendar'
        };
      }

      return { isHoliday: false };
    } catch (error) {
      console.error('Error checking Google Calendar:', error);
      return { isHoliday: false };
    }
  }

  async addHoliday(name, date, type = 'college', userId) {
    try {
      const holiday = await Holiday.create({
        name,
        date: new Date(date),
        type,
        createdBy: userId
      });

      return holiday;
    } catch (error) {
      console.error('Error adding holiday:', error);
      throw error;
    }
  }

  async getUpcomingHolidays(days = 30) {
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);

      const holidays = await Holiday.find({
        date: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ date: 1 });

      return holidays;
    } catch (error) {
      console.error('Error getting upcoming holidays:', error);
      return [];
    }
  }
}

module.exports = new CalendarService();
