const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

const pool = mysql.createPool({
  connectionLimit: 10, // Adjust as per your requirement
  host: '172.105.42.216', // Replace with your host IP
  user: 'whitedee_siva',
  password: 'MUtOj08NvL8q', // Replace with your password
  database: 'whitedee_doc', // Replace with your database name
  waitForConnections: true,
  queueLimit: 0
});



const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/files', express.static(path.resolve(__dirname, 'temp')));

// Middleware for JWT authentication
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).send('Access denied. No token provided.');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).send('Invalid token.');
  }
};

// Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './temp');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024, } // 10MB limit
}).array('files', 8);

// Routes

app.post('/register', async (req, res) => {
  console.log('req')
  const { username, password } = req.body;
  console.log('Received registration request with username:', username);

  try {
    if (!username || !password) {
      return res.status(400).send('Username or password missing');
    }

    const connection = await pool.getConnection();
    const [rows, fields] = await connection.execute('SELECT * FROM User WHERE username = ?', [username]);
    if (rows.length > 0) {
      connection.release();
      return res.status(400).send('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Hashed password:', hashedPassword);

    await connection.execute('INSERT INTO User (username, password) VALUES (?, ?)', [username, hashedPassword]);
    connection.release();
    res.send('User registered');
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Login user
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const connection = await pool.getConnection();
    const [rows, fields] = await connection.execute('SELECT * FROM User WHERE username = ?', [username]);
    if (rows.length === 0) {
      connection.release();
      return res.status(400).send('Invalid username or password.');
    }
    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    connection.release();
    if (!validPassword) {
      return res.status(400).send('Invalid username or password.');
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1m' });
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Change password route
app.post('/api/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) return res.status(400).send('New passwords do not match.');
  try {
    const connection = await pool.getConnection();
    const [rows, fields] = await connection.execute('SELECT * FROM User WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      connection.release();
      return res.status(404).send('User not found.');
    }
    const user = rows[0];
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      connection.release();
      return res.status(400).send('Invalid old password.');
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10); // Hash the new password
    await connection.execute('UPDATE User SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
    connection.release();
    res.send('Password changed successfully');
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.delete('/documents/delete-file/:id/:fileId', async (req, res) => {
  console.log('145', req)
  const { id , fileId } = req.params;
  try {
    const connection = await pool.getConnection();

    // Find document by label in the Document table
    const [docRows] = await connection.execute('SELECT * FROM Document WHERE id = ?', [id]);
    if (docRows.length === 0) {
      connection.release();
      return res.status(404).send('Document not found');
    }

    // Find file by fileId in the File table
    const [fileRows] = await connection.execute('SELECT * FROM File WHERE id = ? AND DocumentId = ?', [fileId, docRows[0].id]);
    if (fileRows.length === 0) {
      connection.release();
      return res.status(404).send('File not found');
    }

    // Delete file from server
    const file = fileRows[0];
    const filePath = path.join(__dirname, 'temp', path.basename(file.fileUrl));
    fs.unlink(filePath, async (err) => {
      if (err) {
        console.error('Failed to delete file from server:', err);
        connection.release();
        return res.status(500).send('Failed to delete file from server');
      }

      // Delete file entry from database
      try {
        await connection.execute('DELETE FROM File WHERE id = ?', [fileId]);
        connection.release();
        res.send('File deleted successfully');
      } catch (error) {
        console.error('Error deleting file from database:', error);
        connection.release();
        res.status(500).send('Internal Server Error');
      }
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).send('Internal Server Error');
  }
});



app.put('/documents/:id', async (req, res) => {
  const { id } = req.params;
  const { mandatory = null, progress = null, approved = null } = req.body;

  if (!id) {
    return res.status(400).json({ message: 'id is required' });
  }

  try {
    const connection = await pool.getConnection();
    const [rows, fields] = await connection.execute(
      'UPDATE Document SET mandatory = ?, progress = ?, approved = ? WHERE id = ?',
      [mandatory, progress, approved, id]
    );

    if (rows.affectedRows === 0) {
      connection.release();
      return res.status(404).json({ message: 'Document not found' });
    }

    const [updatedRows, updatedFields] = await connection.execute(
      'SELECT * FROM Document WHERE id = ?',
      [id]
    );
    connection.release();

    const updatedDocument = updatedRows[0];
    res.json(updatedDocument);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


app.post('/documents', upload, async (req, res) => {
  try {
    const { label, mandatory, approved, progress } = req.body;
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).send({ error: 'Files must be provided' });
    }
    
    const connection = await pool.getConnection();
    
    let [rows, fields] = await connection.execute('SELECT * FROM Document WHERE label = ?', [label]);
    let document;
    
    if (rows.length === 0) {
      [rows, fields] = await connection.execute('INSERT INTO Document (label, mandatory, approved, progress) VALUES (?, ?, ?, ?)', [label, mandatory, approved, progress]);
      document = { id: rows.insertId, label, mandatory, approved, progress };
    } else {
      document = rows[0];
      await connection.execute('UPDATE Document SET mandatory = ?, approved = ?, progress = ? WHERE id = ?', [mandatory, approved, progress, document.id]);
    }
    
    const uploadedFiles = files.map(file => ({
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
      fileUrl: `http://localhost:${port}/files/${file.filename}`,
      DocumentId: document.id,
    }));
    
    await Promise.all(uploadedFiles.map(async (file) => {
      await connection.execute('INSERT INTO File (fileName, fileSize, fileType, fileUrl, DocumentId) VALUES (?, ?, ?, ?, ?)', [file.fileName, file.fileSize, file.fileType, file.fileUrl, file.DocumentId]);
    }));
    
    connection.release();
    
    res.status(200).send({ fileUrls: uploadedFiles.map(file => file.fileUrl) });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(400).send(error);
  }
});


// Retrieve documents route
app.get('/documents', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows, fields] = await connection.execute('SELECT * FROM Document');
    const documents = await Promise.all(rows.map(async (row) => {
      const [filesRows, filesFields] = await connection.execute('SELECT * FROM File WHERE DocumentId = ?', [row.id]);
      const files = filesRows.map(file => ({
        id: file.id,
        fileName: file.fileName,
        fileSize: file.fileSize,
        fileType: file.fileType,
        fileUrl: file.fileUrl,
      }));
      return {
        id: row.id,
        label: row.label,
        mandatory: row.mandatory,
        approved: row.approved,
        progress: row.progress,
        files: files,
      };
    }));
    connection.release();
    res.status(200).send(documents);
  } catch (error) {
    console.error('Error retrieving documents:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Start Server
app.use(express.static(path.join(__dirname, 'dist/file-upload-app')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/file-upload-app/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
