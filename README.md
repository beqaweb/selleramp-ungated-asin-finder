# Node Helper API

Express.js API server for Node Helper.

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Running the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will run on `http://localhost:3000` by default.

### Environment Variables

Create a `.env` file in the root directory:
```
PORT=3000
```

## API Endpoints

- `GET /` - Welcome message
- `GET /api/health` - Health check

## Project Structure

```
node_helper/
├── index.js          # Main server file
├── package.json      # Dependencies and scripts
├── .gitignore        # Git ignore rules
└── README.md         # This file
```
