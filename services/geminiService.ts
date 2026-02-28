
import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private getAI() {
    // Khởi tạo instance mới mỗi lần gọi để đảm bảo lấy đúng API Key mới nhất từ môi trường
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async translate(text: string, targetLanguage: string, partIndex: number = 1, totalParts: number = 1): Promise<string> {
    const ai = this.getAI();
    
    // Hướng dẫn cực kỳ nghiêm ngặt để tránh văn bản thừa
    let instruction = `Bạn là một máy dịch thuật chính xác tuyệt đối. Nhiệm vụ của bạn là dịch đoạn văn bản sau sang ${targetLanguage}.
QUY TẮC ĐẦU RA (QUAN TRỌNG NHẤT):
- CHỈ XUẤT BẢN DỊCH DUY NHẤT. 
- TUYỆT ĐỐI KHÔNG có các câu dẫn dắt, không chào hỏi, không giới thiệu (Ví dụ: KHÔNG ĐƯỢC CÓ các câu như "Đây là bản dịch...", "Dưới đây là...", "Oto profesjonalne tłumaczenie...", v.v.).
- Bản dịch phải bắt đầu ngay lập tức từ nội dung của văn bản gốc.
- Dịch ĐẦY ĐỦ 100% nội dung, từng câu từng chữ, tuyệt đối không được rút gọn, không được tóm tắt.
- Giữ nguyên định dạng, thành ngữ, giọng điệu tự nhiên.`;

    if (totalParts > 1) {
      instruction += `\n- LƯU Ý: Đây là PHẦN ${partIndex}/${totalParts}. Hãy dịch đầy đủ để khớp nối hoàn hảo.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `${instruction}\n\nVăn bản cần dịch:\n${text}`,
    });

    let translated = response.text || '';

    // Hậu xử lý bằng code để loại bỏ các dòng dẫn dắt phổ biến nếu AI lỡ tay thêm vào
    // Xóa các dòng bắt đầu bằng "Dưới đây là", "Đây là", "Oto ", "Tłumaczenie ", "Sure, ", "Here is "
    const lines = translated.split('\n');
    if (lines.length > 1) {
      const firstLine = lines[0].trim();
      const unwantedPatterns = [
        /^đây là/i, /^dưới đây là/i, /^bản dịch/i, /^oto /i, 
        /^tłumaczenie/i, /^here is/i, /^sure/i, /^certainly/i,
        /^ok/i, /^tôi đã dịch/i, /^nội dung dịch/i, /:$/
      ];
      
      const shouldRemoveFirstLine = unwantedPatterns.some(pattern => pattern.test(firstLine)) && firstLine.length < 150;
      
      if (shouldRemoveFirstLine) {
        translated = lines.slice(1).join('\n').trim();
      }
    }

    return translated.trim();
  }

  async generateImagePrompts(translatedText: string): Promise<string> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `Dựa trên câu chuyện sau đây, hãy viết đúng 30 prompt bằng tiếng Việt để tạo hình ảnh minh họa cho 30 cảnh đặc sắc nhất trong câu chuyện. Mỗi prompt phải độc lập, rất dài và chi tiết, bao gồm đầy đủ: tên nhân vật chính xác, hành động cụ thể, trang phục chi tiết, biểu cảm khuôn mặt, cử chỉ tay chân, môi trường xung quanh, ánh sáng, góc nhìn, phong cách nghệ thuật nếu phù hợp. Không đánh số, không ghi tên prompt, không thêm bất kỳ ghi chú nào, không có phụ đề ở trên ảnh, chỉ viết prompt thuần túy và mỗi prompt xuống dòng mới:\n\n${translatedText}`,
      config: { 
        maxOutputTokens: 8192, 
        thinkingConfig: { thinkingBudget: 4096 },
        temperature: 0.9 
      }
    });
    return response.text || '';
  }

  async generateYouTubeDescription(translatedText: string, targetLanguage: string): Promise<string> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Bạn là chuyên gia YouTube tạo nội dung kể chuyện lịch sử/kinh dị. Dựa trên câu chuyện sau (đã dịch sang ${targetLanguage}), viết một mô tả video YouTube HẤP DẪN và SÚC TÍCH bằng đúng ngôn ngữ ${targetLanguage}.
Yêu cầu nghiêm ngặt:
- TUYỆT ĐỐI KHÔNG sử dụng định dạng Markdown (không dùng dấu ** để in đậm, không dùng dấu # cho tiêu đề).
- Để nhấn mạnh, hãy viết IN HOA các từ quan trọng hoặc sử dụng Emoji.
- Độ dài NGẮN GỌN: chỉ từ 400 đến 750 ký tự (giảm một nửa so với thông thường).
- Bắt đầu bằng hook mạnh gây tò mò/sợ hãi.
- Tóm tắt câu chuyện một cách kịch tính.
- Thêm emoji phù hợp khắp nơi để tăng tương tác.
- Lời kêu gọi hành động: like, share, subscribe, bật chuông.
- Kết thúc bằng danh sách 3-6 hashtag phổ biến (có dấu # phía trước hashtag).
Chỉ xuất mô tả thuần túy, không thêm ghi chú gì khác:\n\n${translatedText}`,
      config: { 
        maxOutputTokens: 2048, 
        thinkingConfig: { thinkingBudget: 1024 },
        temperature: 0.85 
      }
    });
    
    let cleanText = response.text || '';
    cleanText = cleanText.replace(/\*\*/g, ''); 
    return cleanText;
  }

  async generateSEOTags(translatedText: string, targetLanguage: string): Promise<string> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Chuyên gia SEO YouTube. Dựa trên câu chuyện sau, tạo danh sách tags chất lượng bằng ${targetLanguage}.
Yêu cầu:
- Tổng độ dài ngắn gọn, chỉ từ 350 đến 450 ký tự
- Tập trung vào các từ khóa cốt lõi nhất, long-tail, tên nhân vật và địa danh chính
- Cách nhau bằng ", ", một dòng duy nhất, không sử dụng dấu #
Chỉ xuất tags thuần túy, không thêm bất kỳ văn bản giải thích nào:\n\n${translatedText}`,
      config: { 
        maxOutputTokens: 2048, 
        thinkingConfig: { thinkingBudget: 1024 },
        temperature: 0.85
      }
    });
    return (response.text || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export const geminiService = new GeminiService();
