GTB OS

Software Requirements Specification (SRS) v1.0

Project Name

GTB OS (Groom To Be / Glow To Be Operating System)

Version

1.0 Draft

Prepared By

Ishak K

1. PROJECT OVERVIEW

GTB OS is an internal web-based operating system designed to manage the complete lifecycle of clients

enrolled in Groom To Be and Glow To Be transformation programs.

The system will centralize:

•

Sales

•

Payments

•

Client Management

•

Consultant Assignments

•

Follow-ups

•

Styling Operations

•

Team Monitoring

•

Reporting

The platform will initially be used only by internal team members.

2. USER ROLES

Founder

Permissions:

•

Full Access

•

View Reports

•

Manage Users

•

Manage Clients

1

•

View Revenue

•

View Performance Metrics

•

Expenses

Operations Head

Permissions:

•

View All Clients

•

Assign Consultants

•

Monitor Operations

•

Track Pending Tasks

•

Generate Reports

CRO (Customer Relationship Officer)

Responsibilities:

•

Weekly Follow-ups

•

Payment Follow-ups

•

Client Satisfaction Tracking

Permissions:

•

Access Assigned Clients Only

Client Coach

Responsibilities:

•

Manage Client Journey

•

Coordinate Consultants

•

Handle Escalations

Permissions:

•

Access Assigned Clients Only

Consultants

Types:

•

Skincare Consultant

•

Fitness Trainer

•

Styling Consultant

2

Permissions:

•

Access Assigned Clients

•

Upload Reports

•

Mark Consultations Completed

Media Team

Permissions:

•

Manage Content Calendar

•

Manage Campaign Tracker

3. CLIENT LIFECYCLE

Lead

↓

Converted

↓

Active

↓

Completed

Alternative Status:

•

On Hold

•

Cancelled

Definition:

Converted = First payment received

Completed = Wedding completed and services delivered

On Hold = Client temporarily pauses services

Cancelled = Service terminated

3

4. CLIENT PROFILE

Each Client Profile Must Contain:

Basic Information:

•

Client ID

•

Name

•

Phone Number

•

Email

•

Groom / Bride

•

Wedding Date

•

City

Sales Information:

•

Converted By

•

Conversion Date

•

Package

•

Package Value

Current Status

Assigned Team

Documents

Activity Timeline

5. PACKAGE MANAGEMENT

Current Packages:

Groom To Be

1 Month

2 Month

3 Month

6 Month

Glow To Be

1 Month

2 Month

4

3 Month

6 Month

Each package should support:

•

Different pricing

•

Different duration

•

Different task workflows

6. PAYMENT MODULE

Track:

•

Total Package Value

•

Amount Paid

•

Outstanding Amount

•

Installments

•

Due Dates

Payment Methods:

•

UPI

•

Bank Transfer

•

Cash

Status:

•

Paid

•

Partially Paid

•

Overdue

Receipts:

•

Upload Receipt

•

Mark Receipt Issued

7. ASSIGNMENT MODULE

Each Client Can Be Assigned:

•

Client Coach

•

CRO

•

Skincare Consultant

•

Fitness Trainer

•

Styling Consultant

5

Assignment History Must Be Stored.

8. CONSULTATION TRACKER

Skincare

Status:

•

Scheduled

•

Completed

•

Overdue

Fields:

•

Date

•

Consultant

•

Notes

•

Plan Uploaded

Fitness

Status:

•

Scheduled

•

Completed

•

Overdue

Fields:

•

Date

•

Trainer

•

Notes

•

Plan Uploaded

Styling

Status:

•

Scheduled

•

Completed

•

Overdue

Fields:

•

Date

•

Stylist

6

•

Guide Uploaded

9. STYLING OPERATIONS MODULE

Track:

•

Styling Date

•

Styling Location

•

Assigned Stylist

•

Travel Requirement

Checklist:

✓ Consultation Done

✓ Outfit Finalized

✓ Accessories Finalized

✓ Guide Delivered

✓ Final Confirmation

Status:

•

Upcoming

•

In Progress

•

Completed

10. CRO TRACKING

For Every Client:

•

Last Follow-up Date

•

Next Follow-up Date

•

Payment Reminder Sent

•

Satisfaction Updated

Alert:

Show Clients Not Contacted For 7 Days.

7

11. OPERATIONS DASHBOARD

Display:

•

Pending Consultations

•

Pending Plans

•

Pending Guides

•

Pending Follow-ups

Operations Head Must Be Able To Monitor Daily Activity.

12. MEDIA DASHBOARD

Track:

Content Pipeline:

•

Planned

•

Shooting

•

Editing

•

Posted

Campaigns:

•

Groom To Be

•

Glow To Be

Fields:

•

Owner

•

Deadline

•

Status

13. DOCUMENT MANAGEMENT

Store:

•

Assessment Forms

•

Consultation Notes

•

Skincare Plans

•

Fitness Plans

•

Styling Guides

•

Receipts

All Documents Linked To Client Profile.

8

14. AUTOMATIC ALERTS

Founder Dashboard:

•

Payment Due Today

•

Consultation Due Today

•

Styling Tomorrow

•

Pending Follow-up

•

Client At Risk

15. REPORTS

Revenue Reports

Collection Reports

Outstanding Payment Reports

Sales Reports

Package-wise Revenue

Coach Performance

CRO Performance

Consultant Performance

Client Satisfaction

16. FUTURE PHASE

Client Portal

WhatsApp Integration

Automated Reminders

Mobile Application

AI Assistant

Advanced Analytics

9

OPEN QUESTIONS TO FINALIZE BEFORE

DEVELOPMENT

1.

Exact workflow for each package.

2.

Wedding-date based automation rules.

3.

Notification channels.

4.

User permission matrix.

5.

Client satisfaction methodology.

6.

Consultant workload limits.

7.

Document formats.

8.

Automation requirements.

9.

Reporting KPIs.

10.

Database architecture.

10
