import express from 'express';
import { Complaint } from '../models/Complaint.js';
import { Department } from '../models/Department.js';


const router = express.Router();

// Complaints per area
router.get('/complaints-per-area', async (req, res, next) => {
  try {
    const pipeline = [
      { $group: { _id: '$area', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { area: '$_id', count: 1, _id: 0 } },
    ];
    const results = await Complaint.aggregate(pipeline);
    res.status(200).json({ data: results });
  } catch (err) {
    next(err);
  }
});

// Complaints per category
router.get('/complaints-per-category', async (req, res, next) => {
  try {
    const pipeline = [
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { category: '$_id', count: 1, _id: 0 } },
    ];
    const results = await Complaint.aggregate(pipeline);
    res.status(200).json({ data: results });
  } catch (err) {
    next(err);
  }
});

// Average resolution time
router.get('/avg-resolution-time', async (req, res, next) => {
  try {
    const pipeline = [
      { $match: { status: 'resolved' } },
      {
        $addFields: {
          resolutionTime: {
            $subtract: [
              { $arrayElemAt: ['$statusLog.at', -1] },
              '$createdAt',
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResolutionMs: { $avg: '$resolutionTime' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          avgResolutionHours: { $divide: ['$avgResolutionMs', 1000 * 60 * 60] },
          count: 1,
          _id: 0,
        },
      },
    ];
    const results = await Complaint.aggregate(pipeline);
    res.status(200).json({ data: results[0] || { avgResolutionHours: 0, count: 0 } });
  } catch (err) {
    next(err);
  }
});

// Department performance
router.get('/department-performance', async (req, res, next) => {
  try {
    const pipeline = [
      { $unwind: '$routing' },
      { $match: { 'routing.isPrimary': true } },
      {
        $group: {
          _id: '$routing.department',
          total: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          avgConfidence: { $avg: '$confidence' },
        },
      },
      {
        $lookup: {
          from: 'departments',
          localField: '_id',
          foreignField: '_id',
          as: 'department',
        },
      },
      { $unwind: '$department' },
      {
        $project: {
          department: '$department.nameEn',
          departmentBn: '$department.nameBn',
          total: 1,
          resolved: 1,
          resolutionRate: {
            $cond: [{ $gt: ['$total', 0] }, { $divide: ['$resolved', '$total'] }, 0],
          },
          avgConfidence: 1,
          _id: 0,
        },
      },
      { $sort: { total: -1 } },
    ];
    const results = await Complaint.aggregate(pipeline);
    res.status(200).json({ data: results });
  } catch (err) {
    next(err);
  }
});

// Auto-route rate
router.get('/auto-route-rate', async (req, res, next) => {
  try {
    const pipeline = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          autoRouted: {
            $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] },
          },
          triaged: {
            $sum: { $cond: [{ $eq: ['$status', 'triage'] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          total: 1,
          autoRouted: 1,
          triaged: 1,
          autoRouteRate: {
            $cond: [{ $gt: ['$total', 0] }, { $divide: ['$autoRouted', '$total'] }, 0],
          },
          triageRate: {
            $cond: [{ $gt: ['$total', 0] }, { $divide: ['$triaged', '$total'] }, 0],
          },
          _id: 0,
        },
      },
    ];
    const results = await Complaint.aggregate(pipeline);
    res.status(200).json({ data: results[0] || { total: 0, autoRouted: 0, triaged: 0, autoRouteRate: 0, triageRate: 0 } });
  } catch (err) {
    next(err);
  }
});

export default router;
