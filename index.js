const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
mongoose.connect('mongodb+srv://root:UbjjsQcmt6sK9K9@cluster0.xrexetn.mongodb.net/5s', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected')).catch(err => console.log(err));

// Multer Storage Configuration for Image Uploads
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Schemas
const ActivitySchema = new mongoose.Schema({
    date: { type: String, required: true },
    time: { type: String, required: true },
    division: String,
    zone: String,
    userName: String,
    numOfActivities: Number,
    images: [
        {
            before: String,
            after: String
        }
    ]
});

const AnnouncementSchema = new mongoose.Schema({
    message: String,
    postedBy: { type: String, default: 'Jathin Aggarwal' },
    timestamp: { type: Date, default: Date.now }
});
const AttendanceSchema = new mongoose.Schema({
    userName: String,
    division: String,
    event: String,
    attended: Boolean
});

const Activity = mongoose.model('Activity', ActivitySchema);
const Announcement = mongoose.model('Announcement', AnnouncementSchema);
const Attendance = mongoose.model('Attendance', AttendanceSchema);

// Routes

// Add Activity Data
app.post('/add-data', upload.array('images', 20), async (req, res) => {
    try {
        const { date, time, division, zone, userName, numOfActivities } = req.body;
        const files = req.files;

        if (files.length !== numOfActivities * 2) {
            return res.status(400).json({ error: `You must upload ${numOfActivities} before and ${numOfActivities} after images.` });
        }

        // Separate before and after images in pairs
        let images = [];
        for (let i = 0; i < files.length; i += 2) {
            images.push({
                before: files[i].path,
                after: files[i + 1].path
            });
        }

        const newActivity = new Activity({ date, time, division, zone, userName, numOfActivities, images });
        await newActivity.save();
        res.status(201).json({ message: 'Activity data added successfully', data: newActivity });
    } catch (error) {
        res.status(500).json({ error: 'Error adding activity data' });
    }
});


// Post Announcement (Admin Only)
app.post('/announcement', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const newAnnouncement = new Announcement({ message });
        await newAnnouncement.save();
        res.status(201).json({ message: 'Announcement posted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error posting announcement' });
    }
});

// Get Announcements
app.get('/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ timestamp: -1 });
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching announcements' });
    }
});

// Mark Attendance
app.post('/mark-attendance', async (req, res) => {
    try {
        const { userName, division, event } = req.body;
        const newAttendance = new Attendance({ userName, division, event, attended: true });
        await newAttendance.save();
        res.status(201).json({ message: 'Attendance marked successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error marking attendance' });
    }
});

app.get('/view-attendance', async (req, res) => {
    try {
        const attendance = await Attendance.find();
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching Attendance' });
    }
});
// Get Activity Records
app.get('/view-records', async (req, res) => {
    try {
        const { division, zone } = req.query;

        if (!division || !zone) {
            return res.status(400).json({ error: 'Division and Zone are required' });
        }

        // Use a case-insensitive regex match for zone to avoid formatting issues
        const records = await Activity.find({
            division,
            zone: { $regex: new RegExp(zone, 'i') } // Case-insensitive matching
        }).sort({ date: -1 });

        if (records.length === 0) {
            return res.status(404).json({ message: 'No records found' });
        }

        res.json(records);
    } catch (error) {
        console.error('Error fetching records:', error);
        res.status(500).json({ error: 'Error fetching records' });
    }
});

app.get('/dashboard-summary', async (req, res) => {
    try {
        // Sum the numOfActivities field across all documents
        const totalActivitiesAggregation = await Activity.aggregate([
            { $group: { _id: null, totalActivities: { $sum: "$numOfActivities" } } }
        ]);

        const totalActivities = totalActivitiesAggregation.length > 0 ? totalActivitiesAggregation[0].totalActivities : 0;

        // Get total unique users
        const uniqueUsers = await Activity.distinct("userName");
        const totalUsers = uniqueUsers.length; 

        // Count total announcements
        const totalAnnouncements = await Announcement.countDocuments();

        res.json({ totalActivities, totalUsers, totalAnnouncements });
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ error: "Error fetching dashboard data" });
    }
});



app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
