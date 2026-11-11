/**
 * Share card: an image of the rubric scores and overall signal, drawn on
 * this device. It contains no name, transcript, code or problem text.
 */
import type { HireSignal, RubricScore } from '../types';
import { APP_NAME } from '../../config/app';
import { hireSignalName, rubricName } from '../../copy/strings';

const C = { board: '#F7F9F8', ink: '#1B1D22', soft: '#5A6168', blue: '#1F4FD8', smudge: '#D5DBDD' };
const FONT = "'Atkinson Hyperlegible Next', sans-serif";

export async function drawShareCard(scores: RubricScore[], hire: HireSignal, date: string): Promise<Blob> {
  try {
    await document.fonts.load(`700 40px ${FONT}`);
    await document.fonts.load(`400 24px ${FONT}`);
  } catch {
    // Falls back to the system sans if fonts can't load.
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const g = canvas.getContext('2d')!;
  g.fillStyle = C.board;
  g.fillRect(0, 0, 1200, 630);

  g.fillStyle = C.ink;
  g.font = `700 30px ${FONT}`;
  g.fillText(APP_NAME, 72, 92);
  g.fillStyle = C.soft;
  g.font = `400 24px ${FONT}`;
  g.fillText(`Mock coding interview, ${date}`, 72, 130);

  g.fillStyle = C.soft;
  g.fillText('Overall signal', 72, 210);
  g.fillStyle = C.ink;
  g.font = `700 56px ${FONT}`;
  g.fillText(hireSignalName[hire], 72, 272);
  // Marker underline under the signal.
  g.strokeStyle = C.blue;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  const w = g.measureText(hireSignalName[hire]).width;
  g.moveTo(72, 292);
  g.bezierCurveTo(72 + w * 0.3, 286, 72 + w * 0.7, 298, 72 + w, 290);
  g.stroke();

  scores.forEach((s, i) => {
    const y = 210 + i * 62;
    g.fillStyle = C.ink;
    g.font = `400 26px ${FONT}`;
    g.fillText(rubricName[s.category], 640, y);
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = k < s.score ? C.ink : C.smudge;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(900 + k * 22, y + 2);
      g.lineTo(906 + k * 22, y - 22);
      g.stroke();
    }
    g.fillStyle = C.soft;
    g.font = `400 24px ${FONT}`;
    g.fillText(`${s.score} of 4`, 1000, y);
  });

  g.fillStyle = C.soft;
  g.font = `400 20px ${FONT}`;
  g.fillText('Practice thinking out loud.', 72, 580);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'));
}
