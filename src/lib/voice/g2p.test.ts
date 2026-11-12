import { describe, expect, it } from 'vitest';
import { arpabetToPhonemes, letterToSound, normalizeText, numberToWords, parseLexicon, phonemize, wordToArpabet } from './g2p';

const lex = parseLexicon(
  [
    'hello HH AH0 L OW1',
    'water W AO1 T ER0',
    'the DH AH0',
    'list L IH1 S T',
    'can K AE1 N',
    'be B IY1',
    'empty EH1 M P T IY0',
    'hash HH AE1 SH',
    'map M AE1 P',
    'sub S AH1 B',
    'array ER0 EY1',
    'merge M ER1 JH',
    'bookings B UH1 K IH0 NG Z',
    'max M AE1 K S',
    'value V AE1 L Y UW0',
    'o OW1',
    'of AH1 V',
    'n EH1 N',
    'log L AO1 G',
    'squared S K W EH1 R D',
    'box B AA1 K S',
    'cat K AE1 T',
    'say S EY1',
    'my M AY1',
    'now N AW1',
    'boy B OY1',
    'go G OW1',
    'better B EH1 T ER0',
  ].join('\n'),
);

describe('pronunciation', () => {
  it('converts ARPAbet to the phonemes Kokoro was trained on', () => {
    expect(arpabetToPhonemes('HH AH0 L OW1')).toBe('həlˈO');
    expect(arpabetToPhonemes('S EY1')).toBe('sˈA');
    expect(arpabetToPhonemes('M AY1')).toBe('mˈI');
    expect(arpabetToPhonemes('N AW1')).toBe('nˈW');
    expect(arpabetToPhonemes('B OY1')).toBe('bˈY');
    expect(arpabetToPhonemes('M ER1 JH')).toBe('mˈɜɹʤ');
    expect(arpabetToPhonemes('S AH1 B')).toBe('sˈʌb');
  });

  it('uses the American flap between vowels', () => {
    expect(arpabetToPhonemes('W AO1 T ER0')).toBe('wˈɔɾəɹ');
    expect(arpabetToPhonemes('B EH1 T ER0')).toBe('bˈɛɾəɹ');
    expect(arpabetToPhonemes('L IH1 S T')).toBe('lˈɪst');
  });

  it('says numbers as words', () => {
    expect(numberToWords(0)).toBe('zero');
    expect(numberToWords(42)).toBe('forty two');
    expect(numberToWords(105)).toBe('one hundred five');
    expect(numberToWords(10_000)).toBe('ten thousand');
    expect(numberToWords(2.5)).toBe('two point five');
  });

  it('says complexity, operators and identifiers the way people do', () => {
    expect(normalizeText('That is O(n log n).')).toBe('That is O of n log n.');
    expect(normalizeText('O(n^2) time')).toBe('O of n squared time');
    expect(normalizeText('if i <= j')).toBe('if i less than or equal to j');
    expect(normalizeText('call merge_bookings on maxValue')).toBe('call merge bookings on max Value');
    expect(normalizeText('up to 10,000 items')).toBe('up to ten thousand items');
  });

  it('finds unknown words as compounds, acronyms or letter rules', () => {
    expect(wordToArpabet('hashmap', lex)).toBe('HH AE1 SH M AE2 P');
    expect(wordToArpabet('subarray', lex)).toBe('S AH1 B ER0 EY2');
    expect(wordToArpabet('BFS', lex)).toBe('B IY1 EH1 F EH1 S');
    expect(wordToArpabet("map's", lex)).toBe('M AE1 P S');
    expect(wordToArpabet('boxes', lex)).toBe('B AA1 K S AH0 Z');
    expect(wordToArpabet('cats', lex)).toBe('K AE1 T S');
    expect(letterToSound('cake')).toBe('K EY1 K');
    expect(letterToSound('nation')).toBe('N AE1 SH AH0 N');
  });

  it('keeps punctuation for pauses and intonation', () => {
    expect(phonemize('Yes, the list can be empty.', lex).endsWith('ˈɛmpti.')).toBe(true);
    expect(phonemize('Hello, the list.', lex)).toBe('həlˈO, ðə lˈɪst.');
    expect(phonemize('O(n log n)', lex)).toBe('ˈO əv ˈɛn lˈɔɡ ˈɛn');
  });

  it('uses unstressed small words inside a sentence, full ones at the end', () => {
    expect(phonemize('the list can be empty.', lex)).toBe('ðə lˈɪst kən bˈi ˈɛmpti.');
    expect(phonemize('Yes, you can.', lex)).toContain('kˈæn.');
  });
});
