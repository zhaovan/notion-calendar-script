// Find the official Notion API client @ https://github.com/makenotion/notion-sdk-js/
import { Client } from '@notionhq/client';
import { config } from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);
// const fetch = require('node-fetch');
config();

let jwtClient;

fs.readFile('privateKey.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Calendar API.

  const privateKey = JSON.parse(content);
  jwtClient = new google.auth.JWT(
    privateKey.client_email,
    null,
    privateKey.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );

  //authenticate request
  jwtClient.authorize(function (err, tokens) {
    if (err) {
      console.log(err);
      return;
    } else {
      console.log('Successfully connected!');
    }
  });
});

// Instantiates Notion Client
const notion = new Client({ auth: process.env.NOTION_KEY });
const database_id = process.env.NOTION_DATABASE_ID;

function listEvent() {
  const calendar = google.calendar({
    version: 'v3',
    auth: jwtClient
  });
  //   console.log(calendar.events);
  calendar.events.list(
    {
      calendarId: 'ivan_zhao@brown.edu',
      timeMin: new Date().toISOString(),
      // maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    },
    (err, res) => {
      console.log(res);
      if (err) return console.log('The API returned an error: ' + err);
      const events = res.data.items;
      if (events.length) {
        console.log('Upcoming 10 events:');
        events.map((event, i) => {
          const start = event.start.dateTime || event.start.date;
          console.log(`${start} - ${event.summary}`);
        });
      } else {
        console.log('No upcoming events found.');
      }
    }
  );
}

// Get a paginated list of Tasks currently in a the database.
async function getTasksFromDatabase() {
  const tasks = {};

  async function getPageOfTasks(cursor) {
    let request_payload = '';
    // Create the request payload based on the presence of a start_cursor
    if (cursor == undefined) {
      request_payload = {
        path: 'databases/' + database_id + '/query',
        method: 'POST'
      };
    } else {
      request_payload = {
        path: 'databases/' + database_id + '/query',
        method: 'POST',
        body: {
          start_cursor: cursor
        }
      };
    }
    // While there are more pages left in the query, get pages from the database.
    const current_pages = await notion.request(request_payload);

    for (const page of current_pages.results) {
      if (
        page.properties.Scheduled &&
        page.properties.Duration &&
        page.properties.Task
      ) {
        tasks[page.id] = {
          Title: page.properties.Task.title[0].text.content,
          Duration: page.properties.Duration.select.name,
          Scheduled: page.properties.Scheduled.checkbox
        };
      }
    }
    if (current_pages.has_more) {
      await getPageOfTasks(current_pages.next_cursor);
    }
  }
  await getPageOfTasks();
  return tasks;
}

async function findChangesAndCreateEvent(tasksInDatabase) {
  console.log('Looking for changes in Notion database ');
  // Fetch calendar here
  const calEvents = listEvents();

  // Get the tasks currently in the database
  const currTasksInDatabase = await getTasksFromDatabase();

  // Iterate over the current tasks and compare them to tasks in our local store (tasksInDatabase)
  for (const [key, value] of Object.entries(currTasksInDatabase)) {
    const page_id = key;

    const scheduled_status = value.Scheduled;

    // If this task hasn't been seen before
    if (!(page_id in tasksInDatabase)) {
      // Add this task to the local store of all tasks
      tasksInDatabase[page_id] = {
        Scheduled: scheduled_status
      };
    } else {
      // If the current status is different from the status in the local store
      if (scheduled_status !== tasksInDatabase[page_id].Scheduled) {
        // Change the local store.
        tasksInDatabase[page_id] = {
          Scheduled: scheduled_status
        };
        // Handle functionality for checking calendar events here
      }
    }
  }
  // Run this method every 5 seconds (5000 milliseconds)
  setTimeout(main, 5000);
}

async function main() {
  const tasksInDatabase = await getTasksFromDatabase();
  findChangesAndCreateEvent(tasksInDatabase).catch(console.error);
}

main();
