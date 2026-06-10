const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname)));

const EDITIONS = {
  roblox:{name:'Roblox',words:[{word:'Adopt Me',clue:'Popular game where you raise and trade virtual pets'},{word:'Brookhaven',clue:'Roleplay game where you live in a town and own homes'},{word:'Jailbreak',clue:'Cops vs robbers open world game with heists'},{word:'Tower of Hell',clue:'Obby game with no checkpoints that gets harder'},{word:'Arsenal',clue:'FPS game where you cycle through all weapons to win'},{word:'Piggy',clue:'Horror game based on Peppa Pig where you escape a monster'},{word:'Bedwars',clue:'Protect your bed while destroying others in this team game'},{word:'Murder Mystery 2',clue:'One murderer, one sheriff, everyone else is innocent'},{word:'Blox Fruits',clue:'One Piece inspired game with devil fruits and fighting'},{word:'Pet Simulator',clue:'Collect and upgrade pets to earn coins and gems'}]},
  clashroyale:{name:'Clash Royale',words:[{word:'Goblin Barrel',clue:'A barrel thrown that releases goblins at the tower'},{word:'Hog Rider',clue:'A muscular man riding a hog that charges at towers'},{word:'Skeleton Army',clue:'A huge mob of skeletons that swarms enemies'},{word:'Fireball',clue:'A ball of fire that deals area damage'},{word:'Witch',clue:'A flying unit that spawns skeletons'},{word:'PEKKA',clue:'Giant armored robot with huge swords'},{word:'Electro Wizard',clue:'A wizard who shoots lightning at multiple units'},{word:'Lava Hound',clue:'A giant flying dog that splits into smaller ones'},{word:'Mega Knight',clue:'A giant knight that jumps and deals damage on landing'},{word:'Royal Ghost',clue:'An invisible swordsman that appears only when attacking'}]},
  brawlstars:{name:'Brawl Stars',words:[{word:'Shelly',clue:'Default brawler that shoots a wide shotgun blast'},{word:'Spike',clue:'Cactus brawler that throws needles in a star pattern'},{word:'Leon',clue:'Brawler who can turn invisible with his super'},{word:'Crow',clue:'Fast brawler who throws poison daggers'},{word:'Frank',clue:'Slow brawler with a huge hammer that stuns on super'},{word:'Piper',clue:'Long range brawler that deals more damage from far away'},{word:'Mortis',clue:'Brawler who dashes with a shovel to deal damage'},{word:'El Primo',clue:'Wrestler brawler who punches and jumps on enemies'},{word:'Sandy',clue:'Legendary who puts enemies to sleep with sandstorms'},{word:'Brock',clue:'Brawler who shoots rockets with long range'}]},
  celebrity:{name:'Celebrity',words:[{word:'Elon Musk',clue:'Tech billionaire who owns Tesla, SpaceX and X'},{word:'MrBeast',clue:'Most subscribed YouTuber known for expensive challenges'},{word:'Cristiano Ronaldo',clue:'Portuguese football star known for his goal celebrations'},{word:'Taylor Swift',clue:'Pop star known for writing songs about her relationships'},{word:'Lionel Messi',clue:'Argentine football legend with multiple Ballon dOr awards'},{word:'Pewdiepie',clue:'Swedish YouTuber who was number one subscribed for years'},{word:'Drake',clue:'Canadian rapper known for hits like Gods Plan'},{word:'Kylie Jenner',clue:'Reality TV star turned cosmetics billionaire'},{word:'KSI',clue:'British YouTuber turned boxer and musician'},{word:'Ronaldo R9',clue:'Brazilian considered one of the best footballers ever'}]},
  general:{name:'General',words:[{word:'Eiffel Tower',clue:'Famous iron lattice tower built in Paris in 1889'},{word:'Pizza',clue:'Italian dish with dough, sauce and cheese baked in oven'},{word:'Shark',clue:'Large predatory fish with multiple rows of teeth'},{word:'Astronaut',clue:'Person trained to travel and work in outer space'},{word:'Volcano',clue:'Mountain that can erupt with lava and ash'},{word:'Chess',clue:'Strategy board game played with 16 pieces per side'},{word:'Submarine',clue:'Vehicle that travels underwater for long periods'},{word:'Guitar',clue:'Stringed instrument played by strumming or picking'},{word:'Dinosaur',clue:'Ancient reptiles that lived millions of years ago'},{word:'Rainbow',clue:'Colorful arc in the sky formed by light and rain'}]}
};

const rooms = {};
function rnd(a){return a[Math.floor(Math.random()*a.length)];}
function genCode(){return Math.random().toString(36).substring(2,7).toUpperCase();}
function getP(room,id){return room.players.find(p=>p.id===id);}

function nextDrawTurn(room){
  room.currentTurn=(room.currentTurn+1)%room.players.length;
  if(room.currentTurn===0)room.round++;
  if(room.round>=room.totalRounds){goVoting(room);}
  else{io.to(room.code).emit('turnChange',{currentTurn:room.currentTurn,round:room.round,totalRounds:room.totalRounds,currentPlayer:room.players[room.currentTurn]});}
}

function nextWordTurn(room){
  room.currentTurn=(room.currentTurn+1)%room.players.length;
  if(room.currentTurn===0)room.round++;
  if(room.round>=room.totalRounds){goVoting(room);}
  else{io.to(room.code).emit('wordTurnChange',{currentPlayer:room.players[room.currentTurn],round:room.round,totalRounds:room.totalRounds,guesses:room.wordGuesses});}
}

function goVoting(room){
  room.phase='voting';
  io.to(room.code).emit('phaseChange',{phase:'voting',players:room.players});
}

function checkAllReady(room){
  if(room.readyIds.size>=room.players.length){
    room.phase=room.gameMode==='draw'?'drawing':'word';
    room.round=0;room.currentTurn=0;room.earlyVotes=new Set();
    if(room.gameMode==='draw'){
      io.to(room.code).emit('drawStart',{currentPlayer:room.players[0],round:0,totalRounds:room.totalRounds});
    } else {
      io.to(room.code).emit('wordStart',{currentPlayer:room.players[0],round:0,totalRounds:room.totalRounds});
    }
  }
}

io.on('connection',(socket)=>{

  socket.on('createRoom',({username,maxPlayers,gameMode,edition})=>{
    const code=genCode();
    rooms[code]={code,players:[],phase:'lobby',word:null,hint:null,impostorId:null,
      currentTurn:0,round:0,totalRounds:5,strokes:[],votes:{},currentStroke:null,
      maxPlayers:maxPlayers||4,gameMode:gameMode||'draw',edition:edition||'roblox',
      wordGuesses:[],readyIds:new Set(),earlyVotes:new Set()};
    const player={id:socket.id,username,isHost:true};
    rooms[code].players.push(player);
    socket.join(code);socket.roomCode=code;
    socket.emit('roomCreated',{code,player,players:rooms[code].players,maxPlayers:rooms[code].maxPlayers,gameMode:rooms[code].gameMode,edition:rooms[code].edition});
  });

  socket.on('joinRoom',({username,code})=>{
    const room=rooms[code];
    if(!room){socket.emit('error',{message:'Room not found.'});return;}
    if(room.phase!=='lobby'){socket.emit('error',{message:'Game already started.'});return;}
    if(room.players.length>=room.maxPlayers){socket.emit('error',{message:'Room is full.'});return;}
    if(room.players.find(p=>p.username.toLowerCase()===username.toLowerCase())){socket.emit('error',{message:'Username taken.'});return;}
    const player={id:socket.id,username,isHost:false};
    room.players.push(player);
    socket.join(code);socket.roomCode=code;
    socket.emit('roomJoined',{code,player,players:room.players,maxPlayers:room.maxPlayers,gameMode:room.gameMode,edition:room.edition});
    socket.to(code).emit('playerJoined',{players:room.players,maxPlayers:room.maxPlayers});
  });

  socket.on('kickPlayer',({playerId})=>{
    const code=socket.roomCode;const room=rooms[code];if(!room)return;
    const host=getP(room,socket.id);if(!host||!host.isHost)return;
    room.players=room.players.filter(p=>p.id!==playerId);
    io.to(playerId).emit('playerKicked',{playerId});
    io.to(code).emit('playerLeft',{players:room.players,maxPlayers:room.maxPlayers});
  });

  socket.on('startGame',()=>{
    const code=socket.roomCode;const room=rooms[code];if(!room)return;
    const host=getP(room,socket.id);if(!host||!host.isHost)return;
    if(room.players.length<3){socket.emit('error',{message:'Need at least 3 players.'});return;}
    const ed=EDITIONS[room.edition]||EDITIONS.general;
    const wordData=rnd(ed.words);
    room.word=wordData.word;room.hint=wordData.clue;
    room.phase='roles';room.strokes=[];room.votes={};room.wordGuesses=[];
    room.readyIds=new Set();room.earlyVotes=new Set();
    room.impostorId=rnd(room.players).id;
    room.players.forEach(p=>{
      const imp=p.id===room.impostorId;
      io.to(p.id).emit('gameStarted',{isImpostor:imp,word:imp?null:room.word,hint:imp?null:room.hint,players:room.players,gameMode:room.gameMode,edition:room.edition});
    });
  });

  socket.on('playerReady',()=>{
    const code=socket.roomCode;const room=rooms[code];if(!room||room.phase!=='roles')return;
    room.readyIds.add(socket.id);
    io.to(code).emit('readyUpdate',{players:room.players,readyIds:[...room.readyIds]});
    checkAllReady(room);
  });

  socket.on('strokeStart',({x,y,color,size})=>{
    const code=socket.roomCode;const room=rooms[code];
    if(!room||room.phase!=='drawing')return;
    if(room.players[room.currentTurn].id!==socket.id)return;
    room.currentStroke={points:[{x,y}],color,size,playerId:socket.id};
    socket.to(code).emit('strokeStart',{x,y,color,size,playerId:socket.id});
  });

  socket.on('strokeMove',({x,y})=>{
    const code=socket.roomCode;const room=rooms[code];
    if(!room||!room.currentStroke)return;
    if(room.players[room.currentTurn].id!==socket.id)return;
    room.currentStroke.points.push({x,y});
    socket.to(code).emit('strokeMove',{x,y,playerId:socket.id});
  });

  socket.on('strokeEnd',()=>{
    const code=socket.roomCode;const room=rooms[code];
    if(!room||!room.currentStroke)return;
    if(room.players[room.currentTurn].id!==socket.id)return;
    room.strokes.push(room.currentStroke);room.currentStroke=null;
    io.to(code).emit('strokeEnd',{playerId:socket.id});
    nextDrawTurn(room);
  });

  socket.on('submitWordGuess',({guess})=>{
    const code=socket.roomCode;const room=rooms[code];
    if(!room||room.phase!=='word')return;
    if(room.players[room.currentTurn].id!==socket.id)return;
    const imp=socket.id===room.impostorId;
    const correct=guess.trim().toLowerCase()===room.word.toLowerCase();
    room.wordGuesses.push({playerId:socket.id,text:guess,correct,isImposter:imp});
    io.to(code).emit('wordGuessUpdate',{guesses:room.wordGuesses});
    setTimeout(()=>nextWordTurn(room),800);
  });

  socket.on('voteEarly',()=>{
    const code=socket.roomCode;const room=rooms[code];if(!room)return;
    room.earlyVotes.add(socket.id);
    const agreed=room.earlyVotes.size>=room.players.length;
    io.to(code).emit('earlyVoteUpdate',{count:room.earlyVotes.size,total:room.players.length,agreed});
    if(agreed)goVoting(room);
  });

  socket.on('endGame',()=>{
    const code=socket.roomCode;const room=rooms[code];if(!room)return;
    const host=getP(room,socket.id);if(!host||!host.isHost)return;
    goVoting(room);
  });

  socket.on('submitVote',({votedId})=>{
    const code=socket.roomCode;const room=rooms[code];
    if(!room||room.phase!=='voting')return;
    const voter=getP(room,socket.id);if(!voter||room.votes[socket.id])return;
    room.votes[socket.id]=votedId;voter.vote=votedId;
    io.to(code).emit('voteUpdate',{votes:room.votes,players:room.players});
    if(Object.keys(room.votes).length===room.players.length){
      const tally={};Object.values(room.votes).forEach(id=>{tally[id]=(tally[id]||0)+1;});
      let max=0,votedOut=null;
      Object.entries(tally).forEach(([id,c])=>{if(c>max){max=c;votedOut=id;}});
      const caught=votedOut===room.impostorId;
      const impostor=getP(room,room.impostorId);
      if(caught){room.phase='impostorGuess';io.to(code).emit('phaseChange',{phase:'impostorGuess',impostorCaught:true,impostor,votedOutId:votedOut});}
      else{room.phase='results';io.to(code).emit('gameResults',{impostorWon:true,impostorId:room.impostorId,impostor,word:room.word,reason:'evaded'});}
    }
  });

  socket.on('impostorGuess',({guess})=>{
    const code=socket.roomCode;const room=rooms[code];
    if(!room||socket.id!==room.impostorId)return;
    const correct=guess.trim().toLowerCase()===room.word.toLowerCase();
    const impostor=getP(room,room.impostorId);room.phase='results';
    io.to(code).emit('gameResults',{impostorWon:correct,impostorId:room.impostorId,impostor,word:room.word,guess,correct,reason:correct?'guessed':'caught'});
  });

  socket.on('restartGame',()=>{
    const code=socket.roomCode;const room=rooms[code];if(!room)return;
    const host=getP(room,socket.id);if(!host||!host.isHost)return;
    room.phase='lobby';room.word=null;room.hint=null;room.impostorId=null;
    room.round=0;room.currentTurn=0;room.strokes=[];room.votes={};
    room.currentStroke=null;room.wordGuesses=[];room.readyIds=new Set();room.earlyVotes=new Set();
    room.players.forEach(p=>p.vote=null);
    io.to(code).emit('backToLobby',{players:room.players,maxPlayers:room.maxPlayers});
  });

  socket.on('disconnect',()=>{
    const code=socket.roomCode;if(!code||!rooms[code])return;
    const room=rooms[code];
    room.players=room.players.filter(p=>p.id!==socket.id);
    if(room.players.length===0){delete rooms[code];return;}
    if(!room.players.find(p=>p.isHost))room.players[0].isHost=true;
    io.to(code).emit('playerLeft',{players:room.players,maxPlayers:room.maxPlayers});
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('Server on port '+PORT));
