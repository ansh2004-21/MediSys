const mongoose = require('mongoose');

// Models (ensure these imports are correct relative to seed.js location)
const User = require('./models/User');
const Bed = require('./models/Bed');
const Patient = require('./models/Patient');
const Doctor = require('./models/Doctor');

// --- DUMMY DATA ---
const users = [
    { firstName: 'System', lastName: 'Admin', email: 'admin@medisys.com', password: 'adminpassword', role: 'Admin' },
    { firstName: 'Dr. Anya', lastName: 'Sharma', email: 'doctor@medisys.com', password: 'password123', role: 'Doctor' },
    { firstName: 'Nurse Jane', lastName: 'Doe', email: 'nurse@medisys.com', password: 'password123', role: 'Nurse' },
    { firstName: 'Reception', lastName: 'Staff', email: 'staff@medisys.com', password: 'password123', role: 'Staff' },
    { firstName: 'Max', lastName: 'Patient', email: 'patient@medisys.com', password: 'password123', role: 'Patient' },
];

const beds = [
    { bedNumber: 'A101', ward: 'General', status: 'Available' },
    { bedNumber: 'A102', ward: 'General', status: 'Available' },
    { bedNumber: 'ICU01', ward: 'ICU', status: 'Available' },
    { bedNumber: 'ICU02', ward: 'ICU', status: 'Occupied' },
    { bedNumber: 'B201', ward: 'Maternity', status: 'Maintenance' },
];

const importData = async () => {
    try {
        await mongoose.connect(uri);
        console.log('--- Connected to MongoDB ---');

        // 1. Clear existing data
        console.log('Clearing old data...');
        await User.deleteMany();
        await Bed.deleteMany();
        await Patient.deleteMany();
        await Doctor.deleteMany();

        // 2. Insert Users using create() to GUARANTEE pre('save') hook runs
        console.log('Inserting core users (hashing passwords)...');
        let createdUsers = [];
        for (const user of users) {
            const newUser = await User.create(user);
            createdUsers.push(newUser);
        }

        // Find users by role to link profiles
        const doctorUser = createdUsers.find(u => u.role === 'Doctor');
        const patientUser = createdUsers.find(u => u.role === 'Patient');

        // 3. Insert specific profiles (Doctor/Patient)
        console.log('Inserting profiles and beds...');
        await Doctor.create({
            user: doctorUser._id,
            specialty: 'Cardiology',
            licenseNumber: 'DOC-12345'
        });

        await Patient.create({
            user: patientUser._id,
            dateOfBirth: new Date('1990-05-15'),
            contactNumber: '555-1234',
            medicalHistory: [{ diagnosis: 'Seasonal Flu', treatment: 'Rest', date: new Date() }],
            isAdmitted: false
        });

        // 4. Insert beds
        await Bed.insertMany(beds);

        console.log('-------------------------------------------');
        console.log('SUCCESS: Database Seeded and Passwords HASHED!');
        console.log('Admin Login: admin@medisys.com / adminpassword');
        console.log('-------------------------------------------');
        process.exit();

    } catch (error) {
        console.error('Error with data seeding:', error);
        process.exit(1);
    }
};

importData();