const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORDS = {
  Animals: ['Elephant', 'Giraffe', 'Penguin', 'Dolphin', 'Tiger', 'Kangaroo', 'Panda', 'Crocodile', 'Flamingo', 'Gorilla'],
  Food: ['Pizza', 'Sushi', 'Burger', 'Taco', 'Strawberry', 'Watermelon', 'Donut', 'Pancake', 'Hot Dog', 'Ice Cream'],
  Objects: ['Umbrella', 'Telescope', 'Skateboard', 'Compass', 'Lantern', 'Anchor', 'Trophy', 'Briefcase', 'Microscope', 'Parachute'],
  Nature: ['Volcano', 'Rainbow', 'Tornado', 'Glacier', 'Cactus', 'Waterfall', 'Avalanche', 'Thunderstorm', 'Coral Reef', 'Northern Lights'],
  Sports: ['Basketball', 'Surfing', 'Archery', 'Fencing', 'Gymnastics', 'Bobsled', 'Polo', 'Javelin', 'Skydiving', 'Rowing'],
  Vehicles: ['Submarine', 'Helicopter', 'Sailboat', 'Rocket', 'Tractor', 'Gondola', 'Zeppelin', 'Hovercraft', 'Rickshaw', 'Snowmobile']
};

const rooms = {};

function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pickWordAndCategory() {
  const categories = Object.keys(WORDS);
  const category = getRandom(categories);
  const word = getRandom(WORDS[category]);
  return { word, category };
}

function getImpostorHint(category) {
  return category;
}

function createRoom(roomCode) {
  rooms[roomCode] = {
    code: roomCode,
    players: [],
    phase: 'lobby',
    word: null,
    category: null,
    impostorId: null,
    currentTurn: 0,
    round: 0,
    totalRounds: 5,
    strokes: [],
    votes: {},
    currentStroke: null
  };
}

function getRoomPlayer(room, id) {
  return room.players.find(p => p.id === id);
}

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function nextTurn(room) {
  room.currentTurn = (room.currentTurn + 1) % room.players.length;
  if (room.currentTurn === 0) room.round++;
  if (room.round >= room.totalRounds) {
    room.phase = 'voting';
    io.to(room.code).emit('phaseChange', { phase: 'voting', players: room.players });
  } else {
    io.to(room.code).emit('turnChange', {
      currentTurn: room.currentTurn,
      round: room.round,
      totalRounds: room.totalRounds,
      currentPlayer: room.players[room.currentTurn]
    });
  }
}

io.on('connection', (socket) => {

  socket.on('createRoom', ({ username }) => {
    const code = generateCode();
    createRoom(code);
    const player = { id: socket.id, username, isHost: true, vote: null };
    rooms[code].players.push(player);
    socket.join(code);
    socket.roomCode = code;
    socket.emit('roomCreated', { code, player, players: rooms[code].players });
  });

  socket.on('joinRoom', ({ username, code }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', { message: 'Room not found.' }); return; }
    if (room.phase !== 'lobby') { socket.emit('error', { message: 'Game already started.' }); return; }
    if (room.players.length >= 10) { socket.emit('error', { message: 'Room is full.' }); return; }
    const taken = room.players.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (taken) { socket.emit('error', { message: 'Username already taken.' }); return; }

    const player = { id: socket.id, username, isHost: false, vote: null };
    room.players.push(player);
    socket.join(code);
    socket.roomCode = code;
    socket.emit('roomJoined', { code, player, players: room.players });
    socket.to(code).emit('playerJoined', { players: room.players });
  });

  socket.on('startGame', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    const host = getRoomPlayer(room, socket.id);
    if (!host || !host.isHost) return;
    if (room.players.length < 3) { socket.emit('error', { message: 'Need at least 3 players.' }); return; }

    const { word, category } = pickWordAndCategory();
    room.word = word;
    room.category = category;
    room.phase = 'drawing';
    room.round = 0;
    room.currentTurn = 0;
    room.strokes = [];
    room.votes = {};
    room.impostorId = getRandom(room.players).id;

    room.players.forEach(p => {
      const isImpostor = p.id === room.impostorId;
      io.to(p.id).emit('gameStarted', {
        isImpostor,
        word: isImpostor ? null : word,
        hint: isImpostor ? getImpostorHint(category) : null,
        category,
        currentTurn: 0,
        round: 0,
        totalRounds: room.totalRounds,
        players: room.players,
        currentPlayer: room.players[0]
      });
    });
  });

  socket.on('strokeStart', ({ x, y, color, size }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'drawing') return;
    if (room.players[room.currentTurn].id !== socket.id) return;
    room.currentStroke = { points: [{ x, y }], color, size, playerId: socket.id };
    socket.to(code).emit('strokeStart', { x, y, color, size, playerId: socket.id });
  });

  socket.on('strokeMove', ({ x, y }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.currentStroke) return;
    if (room.players[room.currentTurn].id !== socket.id) return;
    room.currentStroke.points.push({ x, y });
    socket.to(code).emit('strokeMove', { x, y, playerId: socket.id });
  });

  socket.on('strokeEnd', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.currentStroke) return;
    if (room.players[room.currentTurn].id !== socket.id) return;
    room.strokes.push(room.currentStroke);
    room.currentStroke = null;
    io.to(code).emit('strokeEnd', { playerId: socket.id });
    nextTurn(room);
  });

  socket.on('submitVote', ({ votedId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'voting') return;
    const voter = getRoomPlayer(room, socket.id);
    if (!voter || room.votes[socket.id]) return;
    room.votes[socket.id] = votedId;
    voter.vote = votedId;
    io.to(code).emit('voteUpdate', { votes: room.votes, players: room.players });

    if (Object.keys(room.votes).length === room.players.length) {
      const tally = {};
      Object.values(room.votes).forEach(id => { tally[id] = (tally[id] || 0) + 1; });
      let maxVotes = 0, votedOut = null;
      Object.entries(tally).forEach(([id, count]) => { if (count > maxVotes) { maxVotes = count; votedOut = id; } });
      const impostorCaught = votedOut === room.impostorId;
      const impostor = getRoomPlayer(room, room.impostorId);
      room.phase = impostorCaught ? 'impostorGuess' : 'results';

      if (impostorCaught) {
        io.to(room.impostorId).emit('impostorGuessPrompt', { word: null });
        io.to(code).emit('phaseChange', { phase: 'impostorGuess', impostorCaught, impostor, votedOutId: votedOut });
      } else {
        io.to(code).emit('gameResults', {
          impostorWon: true,
          impostorId: room.impostorId,
          impostor,
          word: room.word,
          reason: 'evaded'
        });
        room.phase = 'results';
      }
    }
  });

  socket.on('impostorGuess', ({ guess }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    if (socket.id !== room.impostorId) return;
    const correct = guess.trim().toLowerCase() === room.word.toLowerCase();
    const impostor = getRoomPlayer(room, room.impostorId);
    room.phase = 'results';
    io.to(code).emit('gameResults', {
      impostorWon: correct,
      impostorId: room.impostorId,
      impostor,
      word: room.word,
      guess,
      correct,
      reason: correct ? 'guessed' : 'caught'
    });
  });

  socket.on('restartGame', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    const host = getRoomPlayer(room, socket.id);
    if (!host || !host.isHost) return;
    room.phase = 'lobby';
    room.word = null;
    room.category = null;
    room.impostorId = null;
    room.round = 0;
    room.currentTurn = 0;
    room.strokes = [];
    room.votes = {};
    room.currentStroke = null;
    room.players.forEach(p => p.vote = null);
    io.to(code).emit('backToLobby', { players: room.players });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) { delete rooms[code]; return; }
    if (!room.players.find(p => p.isHost)) room.players[0].isHost = true;
    io.to(code).emit('playerLeft', { players: room.players });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));
