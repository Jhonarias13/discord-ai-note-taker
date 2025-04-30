const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

async function summarizeMeeting(jsonPath, fechaReunion, nombreCanal) {
  try {
    if (!fs.existsSync(jsonPath)) {
      console.error('❌ Archivo JSON no encontrado:', jsonPath);
      return;
    }

    const jsonData = fs.readFileSync(jsonPath, 'utf8');
    const meetingData = JSON.parse(jsonData);

    const conversation = meetingData.map(item => `${item.user}: "${item.text}"`).join('\n');

    const prompt = `
A partir del siguiente registro de conversación de una reunión de equipo:

${conversation}


Fecha: ${fechaReunion}
Canal: ${nombreCanal}

Genera un resumen estructurado y adaptado para enviar por Discord, siguiendo este formato:

🎧 **Notas de la junta**: [pon aquí la fecha] en #[pon aqui el canal] tomó notas de esta junta de [hora inicio] a [hora final].
Haz una breve descripción (2-4 líneas) de los temas principales que se trataron en la reunión. Sé claro, directo y profesional.

🤝 **Participantes**
Menciona a los participantes con su @handle.

⭐ **Resumen**
- Tema principal 1
  - Punto relevante explicado brevemente, indicando quién lo dijo y el timestamp [hh:mm:ss].
  - Otro punto relacionado, también indicando quién habló y el timestamp [hh:mm:ss].
- Tema principal 2
  - Punto relacionado, mismo formato.

✅ **Elementos de acción** Si aplica.
- Acción a realizar, quién la ejecutará, y el tiempo si aplica [hh:mm:ss].

Notas adicionales: Si aplica
- Agrega al final un aviso que indique que la transcripción es generada automáticamente con IA, por lo cual podría contener imprecisiones.

**Instrucciones de redacción:**
- No repitas información innecesaria.
- Usa viñetas correctamente.
- Mantén el resumen breve, profesional y muy concreto.
- Utiliza Markdown compatible con Discord (negritas, emojis estándar, menciones @).
- Asegúrate de incluir los timestamps [hh:mm:ss] para cada intervención clave.
- No inventes información si no está disponible.
- [hora inicio] y [hora final] deben ser deducidos de los timestamps de las intervenciones.

Ejemplo de emojis que debes usar (Unicode):
- 🎧 para notas de la junta
- 🤝 para participantes
- ⭐ para resumen
- ✅ para elementos de acción

- Usa el formato de fecha y hora en español (es-CO).
- Deduce la hora de inicio y fin de la reunión a partir de los timestamps de las intervenciones.
- Usa el nombre del canal de voz donde se realizó la reunión.
`;


    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4-1106-preview', // Usa GPT-4.1-mini o el mejor modelo disponible
      messages: [
        { role: 'system', content: 'Eres un asistente de productividad experto en reuniones de equipos de trabajo.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, // Bajo para que sea serio y estructurado
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const summary = response.data.choices[0].message.content;

    // Guardarlo opcionalmente
    const fecha = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(__dirname, 'scripts', `resumen_reunion_${fecha}.txt`);
    fs.writeFileSync(outputPath, summary, 'utf8');

    return summary;

  } catch (error) {
    console.error('❌ Error generando el resumen:', error.response?.data || error.message);
  }
}

module.exports = { summarizeMeeting };
