export interface VideoPromptTechnicalSpecs {
  duration?: string;
  aspect_ratio?: string;
  frame_rate?: string;
  audio?: string;
  resolution?: string;
  camera?: string;
  lighting?: string;
  style?: string;
}

export interface VideoPromptSlots {
  shot_framing: string;
  camera_angle: string;
  camera_move: string | null;
  camera_lens: string | null;
  subject: string | null;
  subject_details: string[] | null;
  action: string | null;
  setting: string | null;
  time: string | null;
  lighting: string | null;
  style: string | null;
}

export interface VideoPromptStructuredResponse extends VideoPromptSlots {
  _creative_strategy: string;
  technical_specs: VideoPromptTechnicalSpecs;
  variations?: Array<{ label: string; prompt: string }>;
  shot_plan?: Record<string, unknown> | null;
}
