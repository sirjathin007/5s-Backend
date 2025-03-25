require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static('uploads'));

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images (JPEG, JPG, PNG) are allowed'));
    }
});

const ActivitySchema = new mongoose.Schema({
    date: { type: String, required: true },
    time: { type: String, required: true },
    division: String,
    zone: String,
    userName: String,
    numOfActivities: Number,
    images: [{ before: String, after: String }]
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

app.post('/add-data', [
    body('date').notEmpty().isISO8601(),
    body('time').notEmpty().trim().escape(),
    body('division').trim().escape(),
    body('zone').trim().escape(),
    body('userName').trim().escape(),
    body('numOfActivities').isInt({ min: 1 })
], upload.array('images', 20), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { date, time, division, zone, userName, numOfActivities } = req.body;
        const files = req.files;

        if (files.length !== numOfActivities * 2) {
            return res.status(400).json({ error: `You must upload ${numOfActivities} before and ${numOfActivities} after images.` });
        }

        let images = [];
        for (let i = 0; i < files.length; i += 2) {
            images.push({ before: files[i].path, after: files[i + 1].path });
        }

        const newActivity = new Activity({ date, time, division, zone, userName, numOfActivities, images });
        await newActivity.save();
        res.status(201).json({ message: 'Activity data added successfully', data: newActivity });
    } catch (error) {
        res.status(500).json({ error: 'Error adding activity data' });
    }
});

app.post('/announcement', [
    body('message').notEmpty().trim().escape()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { message } = req.body;
        const newAnnouncement = new Announcement({ message });
        await newAnnouncement.save();
        res.status(201).json({ message: 'Announcement posted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error posting announcement' });
    }
});

app.get('/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ timestamp: -1 });
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching announcements' });
    }
});

app.post('/mark-attendance', [
    body('userName').notEmpty().trim().escape(),
    body('division').notEmpty().trim().escape(),
    body('event').notEmpty().trim().escape()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

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
        res.status(500).json({ error: 'Error fetching attendance' });
    }
});

app.get('/view-records', async (req, res) => {
    try {
        const { division, zone } = req.query;
        if (!division || !zone) {
            return res.status(400).json({ error: 'Division and Zone are required' });
        }

        const records = await Activity.find({ division, zone: { $regex: new RegExp(zone, 'i') } }).sort({ date: -1 });
        if (!records.length) return res.status(404).json({ message: 'No records found' });

        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching records' });
    }
});

app.get('/dashboard-summary', async (req, res) => {
    try {
        const totalActivitiesAggregation = await Activity.aggregate([
            { $group: { _id: null, totalActivities: { $sum: "$numOfActivities" } } }
        ]);
        const totalActivities = totalActivitiesAggregation.length > 0 ? totalActivitiesAggregation[0].totalActivities : 0;

        const uniqueUsers = await Activity.distinct("userName");
        const totalUsers = uniqueUsers.length;

        const totalAnnouncements = await Announcement.countDocuments();

        res.json({ totalActivities, totalUsers, totalAnnouncements });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching dashboard data' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
