const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

// Memorias para los dos tipos de guardado
const scriptLines = [];
const jsonScript = [];
const MIN_VALID_FILE_SIZE = 10 * 1024; // 10 KB

async function convertPcmToWav(pcmPath, wavPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(pcmPath)
      .inputFormat('s16le')
      .inputOptions([
        '-ar 48000',
        '-ac 2',
      ])
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', reject)
      .on('end', resolve)
      .save(wavPath);
  });
}

// Español:
// Esta función ahora utiliza el modelo "gpt-4o-transcribe" en lugar de "whisper-1".
// English:
// This function now uses the "gpt-4o-transcribe" model instead of "whisper-1".
async function transcribeWithWhisper(wavPath) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(wavPath));
  formData.append('model', 'gpt-4o-transcribe');
  formData.append('language', 'es'); // español

  const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
    headers: {
      ...formData.getHeaders(),
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  return response.data.text;
}

async function processRecording(pcmFilePath) {
  try {
    const fileStats = fs.statSync(pcmFilePath);
    if (fileStats.size < MIN_VALID_FILE_SIZE) {
      // console.log(`⚠️ Archivo demasiado pequeño (${fileStats.size} bytes), se omite: ${pcmFilePath}`);
      return;
    }

    const wavFilePath = pcmFilePath.replace('.pcm', '.wav');
    const fileName = path.basename(pcmFilePath);

    const userNameMatch = fileName.match(/^(.+?)_/);
    const userName = userNameMatch ? userNameMatch[1] : 'UsuarioDesconocido';

    // console.log(`🎛️ Convirtiendo ${pcmFilePath} a WAV...`);
    await convertPcmToWav(pcmFilePath, wavFilePath);
    // console.log(`✅ Conversión completada: ${wavFilePath}`);

    // console.log('🧠 Enviando a Whisper para transcripción...');
    const transcription = await transcribeWithWhisper(wavFilePath);

    if (!transcription || transcription.trim().length === 0) {
      // console.log(`⚠️ Whisper devolvió transcripción vacía para ${userName}, se omite.`);
      return;
    }

    const fecha = new Date();
    const hora = fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const cleanedTranscription = transcription.replace(/(\r\n|\n|\r)/gm, ' ');
    scriptLines.push(`${userName} [${hora}]: "${cleanedTranscription}"`);
    jsonScript.push({ user: userName, time: hora, text: cleanedTranscription });

    // console.log(`📝 Transcripción válida agregada al guion.`);

  } catch (error) {
    console.error('❌ Error procesando grabación:', error);
  }
}

async function saveFinalScript() {
  if (scriptLines.length === 0) {
    console.log('⚠️ No hay nada que guardar.');
    return;
  }

  const fecha = new Date().toISOString().replace(/[:.]/g, '-');
  const txtPath = path.join(__dirname, 'scripts', `guion_reunion_${fecha}.txt`);
  const jsonPath = path.join(__dirname, 'scripts', `guion_reunion_${fecha}.json`);

  const finalScript = scriptLines.join('\n');

  // Guardar como .txt
  fs.writeFileSync(txtPath, finalScript, 'utf8');
  console.log(`✅ Guion de la reunión guardado en: ${txtPath}`);

  // Guardar como .json
  fs.writeFileSync(jsonPath, JSON.stringify(jsonScript, null, 2), 'utf8');
  console.log(`✅ Guion en formato JSON guardado en: ${jsonPath}`);

  return {
    txtPath,
    jsonPath
  };
}

module.exports = { processRecording, saveFinalScript };
