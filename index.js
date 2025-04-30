const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, getVoiceConnection, EndBehaviorType } = require('@discordjs/voice');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prism = require('prism-media');

const { processRecording, saveFinalScript } = require('./transcriber');
const { summarizeMeeting } = require('./summarizer')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const state = {
  isRecording: false,
  channelId: null,
  textChannelId: null,
}


function eliminarArchivosDeGrabaciones() {
  const recordingsDir = path.join(__dirname, 'recordings');
  const scriptsDir = path.join(__dirname, 'scripts');
  fs.readdir(recordingsDir, (err, files) => {
    if (err) {
      console.error('❌ Error al leer la carpeta recordings:', err);
      return;
    }
    for (const file of files) {
      const filePath = path.join(recordingsDir, file);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`❌ Error al borrar el archivo ${file}:`, err);
        }
      });
    }
  });
  fs.readdir(scriptsDir, (err, files) => {
    if (err) {
      console.error('❌ Error al leer la carpeta scripts:', err);
      return;
    }
    for (const file of files) {
      const filePath = path.join(scriptsDir, file);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`❌ Error al borrar el archivo ${file}:`, err);
        }
      });
    }
  });
}

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

async function handleConnection(connection, guild) {
  console.log('🎧 Iniciando capturador de audio...');

  connection.receiver.speaking.on('start', (userId) => {
    const user = guild.members.cache.get(userId);
    console.log(`🎤 ${user?.user.username || 'Usuario desconocido'} empezó a hablar`);

    const audioStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 100,
      },
    });

    audioStream.setMaxListeners(20);

    const outputPath = path.join(__dirname, `recordings/${user?.user.username || userId}_${Date.now()}.pcm`);
    const writer = fs.createWriteStream(outputPath);

    const opusDecoder = new prism.opus.Decoder({
      frameSize: 960,
      channels: 2,
      rate: 48000,
    });

    audioStream.pipe(opusDecoder).pipe(writer);

    writer.on('finish', async () => {
      console.log(`✅ Guardado audio de ${user?.user.username || userId}`);

      await processRecording(outputPath);
    });
  });
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return; // Ignorar mensajes de otros bots

  console.log(`📬 Mensaje recibido: ${message.content}`);

  if (message.content === '!join') {
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel) {
      return message.reply('❌ Debes estar en un canal de voz para usar este comando.');
    }

    state.textChannelId = message.channel.id;

    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    message.reply(`✅ ¡Me he unido al canal de voz: **${voiceChannel.name}**!\nSe han activado las notas y la transcripción generadas por inteligencia artificial.`);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const botId = client.user.id;

  if (newState.member?.user.id === botId) {
    if (newState.channelId) {
      console.log(`🚀 Bot detectado en canal: ${newState.channel.name}`);

      // No hacemos joinVoiceChannel de nuevo aquí
      const connection = getVoiceConnection(newState.guild.id);

      if (!connection) {
        console.log('⚠️ No se encontró una conexión activa.');
        return;
      }

      if (state.isRecording && state.channelId === newState.channelId) {
        console.log('❌ Ya hay una grabación en curso.');
        return;
      }

      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

        const player = createAudioPlayer();
        const filePath = path.join(__dirname, 'assets', 'start_recording.mp3');
        const resource = createAudioResource(filePath);

        connection.subscribe(player);
        player.play(resource);

        player.on(AudioPlayerStatus.Idle, async () => {
          // esperar 5 segundos antes de iniciar la grabación

          state.isRecording = true;
          state.channelId = newState.channelId;
          await handleConnection(connection, newState.guild);
        });

      } catch (error) {
        console.error('❌ Error al preparar capturador:', error);
      }

    } else if (oldState.channelId && !newState.channelId) {
      console.log('❌ Bot fue expulsado del canal de voz.');

      state.isRecording = false;
      state.channelId = null;

      const filePath = await saveFinalScript(oldState.channel.name);
      console.log('✅ Grabación finalizada y guardada.');

      const resumen = await summarizeMeeting(filePath.jsonPath, new Date().toISOString(), oldState.channel.name);

      // Enviar mensaje al canal de voz con el resumen generado por IA de la reunión
      const channel = client.channels.cache.get(state.textChannelId);
      if (channel && channel.isTextBased()) {
        // Leer el resumen generado por IA desde el archivo correspondiente
        await channel.send(`**Resumen de la reunión:**\n${resumen}`);
      } else {
        console.error('❌ No se encontró el canal de texto.');
      }

      // Elimina todos los archivos de la carpeta 'recordings'
      // eliminarArchivosDeGrabaciones();
    }
  }
});




client.login(process.env.DISCORD_TOKEN);
