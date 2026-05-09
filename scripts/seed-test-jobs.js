const mongoose = require('mongoose');
require('dotenv').config();
const QueueJob = require('../models/QueueJob');

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // // Clear existing test data to avoid clutter
        // await QueueJob.deleteMany({ customerEmail: /@testmail\.io$/ });
        // console.log('Cleared previous test mails.');

        const testJobs = [
            // Single Job 1
            {
                customerName: 'Aman Deep',
                customerEmail: 'aman@testmail.io',
                emailSubject: 'URGENT: Business Card Design',
                mailBody: 'Please design a premium business card for our new startup. Attached are the logo and details.',
                folderPath: 'C:\\InboundJobs\\aman@testmail.io\\2026-05-07_BC_Design',
                relativeFolderPath: 'aman@testmail.io/2026-05-07_BC_Design',
                status: 'QUEUED',
                priorityScore: 5,
                queuePosition: Date.now() + 1,
                type: 'EMAIL',
                attachments: ['logo.png', 'details.pdf']
            },
            // Single Job 2
            {
                customerName: 'Priya Sharma',
                customerEmail: 'priya@testmail.io',
                emailSubject: 'Wedding Invite Revision',
                mailBody: 'Hi, please change the font on the second page to something more elegant.',
                folderPath: 'C:\\InboundJobs\\priya@testmail.io\\2026-05-07_Wedding_Invite',
                relativeFolderPath: 'priya@testmail.io/2026-05-07_Wedding_Invite',
                status: 'QUEUED',
                priorityScore: 0,
                queuePosition: Date.now() + 2,
                type: 'EMAIL',
                attachments: ['invite_v1.jpg']
            },
            // Batch Group (Same email) - Job A
            {
                customerName: 'Corporate Solutions',
                customerEmail: 'ops@testmail.io',
                emailSubject: 'Monthly Brochure - Part 1',
                mailBody: 'Here is the content for the first part of the monthly brochure.',
                folderPath: 'C:\\InboundJobs\\ops@testmail.io\\2026-05-07_Brochure_P1',
                relativeFolderPath: 'ops@testmail.io/2026-05-07_Brochure_P1',
                status: 'QUEUED',
                priorityScore: 0,
                queuePosition: Date.now() + 3,
                type: 'EMAIL',
                attachments: ['content_p1.docx']
            },
            // Batch Group (Same email) - Job B
            {
                customerName: 'Corporate Solutions',
                customerEmail: 'ops@testmail.io',
                emailSubject: 'Monthly Brochure - Part 2',
                mailBody: 'And here is the second part.',
                folderPath: 'C:\\InboundJobs\\ops@testmail.io\\2026-05-07_Brochure_P2',
                relativeFolderPath: 'ops@testmail.io/2026-05-07_Brochure_P2',
                status: 'QUEUED',
                priorityScore: 0,
                queuePosition: Date.now() + 4,
                type: 'EMAIL',
                attachments: ['content_p2.docx']
            },
            // Additional Jobs
            {
                customerName: 'Vikram Singh',
                customerEmail: 'vikram@testmail.io',
                emailSubject: 'Poster Design for Event',
                mailBody: 'Need a large format poster for our community event next week.',
                folderPath: 'C:\\InboundJobs\\vikram@testmail.io\\2026-05-07_Poster',
                relativeFolderPath: 'vikram@testmail.io/2026-05-07_Poster',
                status: 'QUEUED',
                priorityScore: 10,
                queuePosition: Date.now() + 5,
                type: 'EMAIL',
                attachments: ['event_details.txt']
            },
            {
                customerName: 'Anjali Menon',
                customerEmail: 'anjali@testmail.io',
                emailSubject: 'Menu Card Printing',
                mailBody: 'Please find the menu draft for our restaurant.',
                folderPath: 'C:\\InboundJobs\\anjali@testmail.io\\2026-05-07_Menu',
                relativeFolderPath: 'anjali@testmail.io/2026-05-07_Menu',
                status: 'QUEUED',
                priorityScore: 0,
                queuePosition: Date.now() + 6,
                type: 'EMAIL',
                attachments: ['menu_v1.pdf']
            }
        ];

        await QueueJob.insertMany(testJobs);
        console.log(`Successfully added ${testJobs.length} test mails to the queue.`);
        
        process.exit(0);
    } catch (err) {
        console.error('Seed Error:', err);
        process.exit(1);
    }
}

seed();
