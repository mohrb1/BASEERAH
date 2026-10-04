export const ANALYZE_INPUT_KEY = "baseerah:analyze-input";
export const ANALYZE_RESULT_KEY = "baseerah:analyze-result";

export interface StoredAnalyzeInput {
  text: string;
  inputType: "text" | "image";
}
