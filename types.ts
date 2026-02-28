
export interface ContentResult {
  translatedText?: string[]; // Chuyển thành mảng để lưu từng đoạn
  imagePrompts?: string;
  youtubeDescription?: string;
  seoTags?: string;
  targetLanguage: string;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  data: ContentResult | null;
  inputText: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  STEP_TRANSLATING = 'STEP_TRANSLATING',
  STEP_PROMPTS = 'STEP_PROMPTS',
  STEP_DESCRIPTION = 'STEP_DESCRIPTION',
  STEP_TAGS = 'STEP_TAGS',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'Tiếng Anh' },
  { code: 'pl', name: 'Tiếng Ba Lan' },
  { code: 'cs', name: 'Tiếng Séc' },
  { code: 'fr', name: 'Tiếng Pháp' },
  { code: 'de', name: 'Tiếng Đức' },
  { code: 'es', name: 'Tiếng Tây Ban Nha' },
  { code: 'pt', name: 'Tiếng Bồ Đào Nha' },
  { code: 'nl', name: 'Tiếng Hà Lan' },
  { code: 'hu', name: 'Tiếng Hungary' },
  { code: 'sl', name: 'Tiếng Slovenia' },
  { code: 'ro', name: 'Tiếng Romania' },
  { code: 'vi', name: 'Tiếng Việt' }
];
