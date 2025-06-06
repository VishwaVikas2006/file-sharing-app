# File Sharing Application

A simple file sharing application built with Node.js, Express, and MongoDB Atlas for file storage.

## Features

- User-based file management
- File upload with 10MB size limit
- Support for images and PDFs
- File download and deletion
- Simple and intuitive UI

## Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account
- npm or yarn package manager

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd file-sharing-app
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your MongoDB connection string:
```
MONGODB_URI=mongodb+srv://Vishwa:Vishwa@cluster0.l82ddp2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
PORT=3000
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Enter a user ID to access your files
2. Upload files using the upload section
3. View, download, or delete your files from the list
4. Logout when done

## File Limitations

- Maximum file size: 10MB
- Supported file types: Images and PDFs

## API Endpoints

- `POST /api/files/upload` - Upload a file
- `GET /api/files/:fileId` - Download a file
- `DELETE /api/files/:fileId` - Delete a file
- `GET /api/files/user/:userId` - Get all files for a user

## License

MIT 