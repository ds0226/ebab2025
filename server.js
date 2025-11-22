// server.js - A minimal server to serve static files

const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files (HTML, CSS, JS) from the current directory
app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});