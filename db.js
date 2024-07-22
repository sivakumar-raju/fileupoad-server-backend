const mysql = require('mysql2');

// Replace with your actual connection details
const connection = mysql.createConnection({
    host: '172.105.42.216', // Replace with your host IP
    user: 'whitedee_siva',
    password: 'MUtOj08NvL8q', // Replace with your password
    database: 'whitedee_doc', // Replace with your database name
});

// Connect to the database
connection.connect(err => {
    if (err) {
        console.error('Error connecting to database:', err.stack);
        return;
    }
    console.log('Connected to MariaDB database!');
});

// Perform queries or other operations here...

// Close the connection when done
connection.end(err => {
    if (err) {
        console.error('Error closing database connection:', err.stack);
        return;
    }
    console.log('Connection closed.');
});
