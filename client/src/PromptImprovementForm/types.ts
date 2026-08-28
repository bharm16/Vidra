export interface Question {
  id: number;
  title: string;
  description: string;
  field: "specificAspects" | "backgroundLevel" | "intendedUse";
  examples: string[];
}

export interface FormData {
  specificAspects: string;
  backgroundLevel: string;
  intendedUse: string;
}

export interface PromptImprovementFormProps {
  onComplete: (enhancedPrompt: string, formData: FormData) => void;
  initialPrompt?: string;
}
