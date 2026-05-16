const express = require('express');
const router = express.Router();
const User = require('../models/User');
const QueueJob = require('../models/QueueJob');
const uploadAny = require('../middleware/uploadAny');
const eventBus = require('../services/eventBus');
const fs = require('fs');
const path = require('path');
const SystemConfig = require('../models/SystemConfig');

// Helper for Haversine distance
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  var R = 6371000; // Radius of the earth in m
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in m
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

router.get('/staff-info/:staffId', async (req, res) => {
  try {
    const staff = await User.findById(req.params.staffId);
    if (!staff || !staff.isActive) {
      return res.status(404).json({ message: 'Staff member not found or inactive.' });
    }
    res.json({ staffName: staff.name });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'walkinGeoRequired' });
    // Default to true if not set
    res.json({ walkinGeoRequired: config ? config.value : true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/upload/:staffId', uploadAny.array('files', 10), async (req, res) => {
  try {
    const { staffId } = req.params;
    let { customerName, customerPhone, description, latitude, longitude } = req.body;
    
    // PHONE NORMALIZATION
    if (customerPhone && /^\d{10,15}$/.test(customerPhone) && customerPhone.startsWith('91')) {
      customerPhone = customerPhone.substring(2);
    }
    
    if (!customerName || !customerPhone || !req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Missing required fields or files.' });
    }

    // Geolocation Validation (Optional)
    const geoConfig = await SystemConfig.findOne({ key: 'walkinGeoRequired' });
    const isGeoRequired = geoConfig ? geoConfig.value : true;

    if (isGeoRequired) {
      const pressLat = parseFloat(process.env.PRESS_LAT || '12.9716');
      const pressLon = parseFloat(process.env.PRESS_LONG || '77.5946');
      
      if (!latitude || !longitude) {
        req.files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path) });
        return res.status(400).json({ message: 'Location data is required.' });
      }

      const distance = getDistanceFromLatLonInM(pressLat, pressLon, parseFloat(latitude), parseFloat(longitude));
      
      // We allow a 150-meter radius
      if (distance > 150) {
        req.files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path) });
        return res.status(403).json({ message: 'You must be at the press premises to upload files.' });
      }
    }

    const staff = await User.findById(staffId);
    if (!staff) {
      req.files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path) });
      return res.status(404).json({ message: 'Staff not found.' });
    }

    // Organize files
    const uploadBase = process.env.UPLOAD_PATH || path.join(__dirname, '..', 'uploads');
    const walkinFolder = path.join(uploadBase, 'Walkins', `${staffId}_${Date.now()}`);
    fs.mkdirSync(walkinFolder, { recursive: true });

    const attachments = [];
    const attachmentMeta = {};

    req.files.forEach(f => {
      const dest = path.join(walkinFolder, f.filename);
      fs.renameSync(f.path, dest);
      attachments.push(f.filename);
      attachmentMeta[f.filename] = f.originalname;
    });

    // DEDUPLICATION / MERGING LOGIC:
    // Check if there's already a WALKIN job assigned/pinned to this staff with no files.
    // This happens when a staff member manually requests a walk-in approval before the upload.
    let job = await QueueJob.findOneAndUpdate(
      {
        type: 'WALKIN',
        $or: [
          { pinnedToStaff: staffId },
          { assignedTo: staffId }
        ],
        folderPath: { $in: ['', null] },
        status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'QUEUED'] }
      },
      {
        $set: {
          emailSubject: `Walk-in: ${customerName}`,
          customerName,
          customerPhone,
          mailBody: description || 'Walk-in customer uploaded files via QR portal.',
          folderPath: walkinFolder,
          relativeFolderPath: path.relative(uploadBase, walkinFolder).replace(/\\/g, '/'),
          attachments,
          attachmentMeta,
          pinnedToStaff: staffId, 
          continuityContext: `Pinned to ${staff.name} via QR`, // Explicitly tag with staff name
          status: 'QUEUED' 
        },
        $push: {
          auditLog: {
            action: 'JOB_INGESTED',
            timestamp: new Date(),
            details: { 
              note: 'Physical files linked to existing walk-in placeholder.',
              attachmentsIngested: attachments.length
            }
          }
        }
      },
      { new: true }
    );

    if (!job) {
      job = await QueueJob.create({
        emailSubject: `Walk-in: ${customerName}`,
        customerName,
        customerPhone,
        mailBody: description || 'Walk-in customer uploaded files via QR portal.',
        folderPath: walkinFolder,
        relativeFolderPath: path.relative(uploadBase, walkinFolder).replace(/\\/g, '/'),
        attachments,
        attachmentMeta,
        type: 'WALKIN',
        status: 'QUEUED',
        assignedTo: null,
        pinnedToStaff: staffId,
        continuityContext: `Pinned to ${staff.name} via QR`,
        priorityScore: 5,
        auditLog: [{
          action: 'JOB_INGESTED',
          timestamp: new Date(),
          details: { attachmentsIngested: attachments.length }
        }]
      });
    }

    eventBus.emit('job:walkin_received', { job, staffId });
    if (staffId) {
      eventBus.emit('job:pinned', { jobId: job._id, staffId });
    }

    res.json({ message: 'Upload successful!', jobId: job._id });

  } catch (err) {
    console.error('Customer Upload Error:', err);
    res.status(500).json({ message: 'Server error during upload.' });
  }
});

module.exports = router;
