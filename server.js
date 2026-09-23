require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 3000;

// Allow JSON request bodies
app.use(express.json());

// Rate limiter
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
        error: "Too many requests. Please try again later."
    }
});

app.use(limiter);

// SQLite database
const db = new sqlite3.Database("./quickcuts.db", (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});

// Create queue table
db.run(`
    CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customerName TEXT NOT NULL,
        serviceType TEXT NOT NULL CHECK (
            serviceType IN ('Haircut', 'Shave', 'Haircut + Shave')
        ),
        status TEXT NOT NULL DEFAULT 'Waiting' CHECK (
            status IN ('Waiting', 'In Chair', 'Done')
        ),
        timeIn TEXT NOT NULL
    )
`, (err) => {
    if (err) {
        console.error("Error creating queue table:", err.message);
    } else {
        console.log("Queue table is ready.");
    }
});

// Allowed values
const allowedServices = [
    "Haircut",
    "Shave",
    "Haircut + Shave"
];

const allowedStatuses = [
    "Waiting",
    "In Chair",
    "Done"
];

// API key middleware
function requireApiKey(req, res, next) {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({
            error: "Unauthorized. Valid API key is required."
        });
    }

    next();
}



app.get("/queue", (req, res, next) => {

    db.all(
        `SELECT * FROM queue ORDER BY id ASC`,
        [],
        (err, rows) => {

            if (err) {
                return next(err);
            }

            res.status(200).json(rows);
        }
    );
});


app.get("/queue/:id", (req, res, next) => {

    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            error: "Invalid queue ID."
        });
    }

    db.get(
        `SELECT * FROM queue WHERE id = ?`,
        [id],
        (err, row) => {

            if (err) {
                return next(err);
            }

            if (!row) {
                return res.status(404).json({
                    error: "Queue entry not found."
                });
            }

            res.status(200).json(row);
        }
    );
});


app.post("/queue", requireApiKey, (req, res, next) => {

    const { customerName, serviceType } = req.body;

    // Validate customerName
    if (
        !customerName ||
        typeof customerName !== "string" ||
        customerName.trim() === ""
    ) {
        return res.status(400).json({
            error: "customerName is required."
        });
    }

    // Validate serviceType
    if (!allowedServices.includes(serviceType)) {
        return res.status(400).json({
            error: "serviceType must be Haircut, Shave, or Haircut + Shave."
        });
    }

    // Server-generated values
    const status = "Waiting";

    const timeIn = new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila"
    });

    const sql = `
        INSERT INTO queue
        (customerName, serviceType, status, timeIn)
        VALUES (?, ?, ?, ?)
    `;

    db.run(
        sql,
        [
            customerName.trim(),
            serviceType,
            status,
            timeIn
        ],
        function (err) {

            if (err) {
                return next(err);
            }

            db.get(
                `SELECT * FROM queue WHERE id = ?`,
                [this.lastID],
                (err, row) => {

                    if (err) {
                        return next(err);
                    }

                    res.status(201).json(row);
                }
            );
        }
    );
});


app.put("/queue/:id", requireApiKey, (req, res, next) => {

    const id = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            error: "Invalid queue ID."
        });
    }

    // Validate status
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            error: "status must be Waiting, In Chair, or Done."
        });
    }

    db.run(
        `
        UPDATE queue
        SET status = ?
        WHERE id = ?
        `,
        [status, id],
        function (err) {

            if (err) {
                return next(err);
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Queue entry not found."
                });
            }

            db.get(
                `SELECT * FROM queue WHERE id = ?`,
                [id],
                (err, row) => {

                    if (err) {
                        return next(err);
                    }

                    res.status(200).json(row);
                }
            );
        }
    );
});


app.delete("/queue/:id", requireApiKey, (req, res, next) => {

    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({
            error: "Invalid queue ID."
        });
    }

    // First find the entry
    db.get(
        `SELECT * FROM queue WHERE id = ?`,
        [id],
        (err, row) => {

            if (err) {
                return next(err);
            }

            if (!row) {
                return res.status(404).json({
                    error: "Queue entry not found."
                });
            }

            // Delete the entry
            db.run(
                `DELETE FROM queue WHERE id = ?`,
                [id],
                function (err) {

                    if (err) {
                        return next(err);
                    }

                    res.status(200).json({
                        message: "Queue entry deleted successfully.",
                        entry: row
                    });
                }
            );
        }
    );
});


app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({
        error: "Internal server error."
    });
});


app.listen(PORT, () => {
    console.log(`QuickCuts API running on http://localhost:${PORT}`);
});