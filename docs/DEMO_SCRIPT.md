# Shonglap Demo Script (5 Minutes)

## Prerequisites
- Server running on http://localhost:5000
- Client running on http://localhost:5173
- Database seeded with demo data (`npm run seed:demo`)

## Demo Flow

### 1. Introduction (30s)
- Open http://localhost:5173
- Show the home page with "Report a Problem" button and track-by-ID box
- Toggle language between Bangla and English

### 2. Bangla Voice Complaint (60s)
- Click "Report a Problem"
- Speak in Bangla: "গুলশান ২ নম্বর রোডে বড় গর্ত হয়েছে, গাড়ি চলতে পারছে না"
- Click "Record" → speak → "Stop"
- Click "Transcript" to transcribe
- Show editable transcript
- Select area: Gulshan
- Use "Use my location" or drag pin on map
- Click Submit

### 3. Review & Confirm (45s)
- Show extracted summary (category: road, urgency: high)
- Show detected department: "Dhaka North City Corporation"
- Explanation: "This goes to DNCC because it is a road problem"
- Answer follow-up question if asked
- Check consent checkbox
- Click "Submit Complaint"

### 4. Success Screen (15s)
- Show tracking ID (e.g., DHK-20261122-0001)
- Click "Copy" button
- Click "View Status"

### 5. Photo Complaint (45s)
- Go back to Report page
- Upload a photo of a pothole/garbage
- Show photo preview with privacy blur toggle
- Type text: "Garbage pile in Mirpur 10"
- Select area: Mirpur
- Submit → Review → Confirm

### 6. Triage Case (30s)
- Report a spam message: "Buy cheap products online"
- Show that it's flagged as spam and sent to triage
- Or report an unclear complaint without area → triage

### 7. Multi-Department Case (45s)
- Report: "Waterlogging in Mirpur 10 after rain, knee deep water"
- Show routing: WASA (primary) + DNCC (secondary)
- Explain multi-department handling

### 8. Dashboard (60s)
- Login as department: dncc@shonglap.gov.bd / dept123
- Show filterable complaint table sorted by urgency
- Click "View" on a complaint
- Show photos, audio, transcript, map, status controls
- Update status to "In Progress" with a note
- Show status update email notification

### 9. Admin View (45s)
- Login as admin: admin@shonglap.gov.bd / admin123
- Show Triage Queue
- Assign a triaged complaint to a department
- Re-route a complaint to a different department
- Show RoutingCorrection is saved

### 10. Public Map (30s)
- Open /map
- Show clustered markers colored by urgency
- Filter by category, status, urgency
- Click a marker to see popup details

### 11. Analytics (30s)
- Open /analytics
- Show complaints per area (bar chart)
- Show complaints per category (pie chart)
- Show department performance
- Show auto-route rate and avg resolution time

### 12. Track Page (15s)
- Enter tracking ID from step 4
- Show status timeline

## Key Talking Points
- Hybrid routing: rules → jurisdiction → LLM → triage
- Multi-language: Bangla, English, Banglish
- Anonymous reports allowed
- Privacy: face/plate blur, data retention
- SLA escalation with cron jobs
- Duplicate detection with supporter count
- Real-time notifications via email + webhook
