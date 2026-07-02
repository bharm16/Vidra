import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { Textarea } from "@promptstudio/system/components/ui/textarea";

import type { FormData, PromptImprovementFormProps, Question } from "./types";

import { useQuestionGeneration } from "./hooks/useQuestionGeneration";
import { buildEnhancedPrompt } from "./utils/questionGeneration";

export const PromptImprovementForm = ({
  onComplete,
  initialPrompt = "",
}: PromptImprovementFormProps): React.ReactElement => {
  const [expandedSection, setExpandedSection] = useState<number | null>(1);
  const [formData, setFormData] = useState<FormData>({
    specificAspects: "",
    backgroundLevel: "",
    intendedUse: "",
  });

  const { questions, isLoading, error } = useQuestionGeneration(initialPrompt);

  const toggleSection = (id: number): void => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  const handleInputChange = (field: keyof FormData, value: string): void => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleExampleClick = (field: keyof FormData, example: string): void => {
    setFormData((prev) => ({ ...prev, [field]: example }));
  };

  const handleSubmit = (): void => {
    onComplete(buildEnhancedPrompt(initialPrompt, formData), formData);
  };

  const isComplete =
    Boolean(formData.specificAspects) ||
    Boolean(formData.backgroundLevel) ||
    Boolean(formData.intendedUse);

  return (
    <div className="mx-auto w-full max-w-2xl rounded-lg border-2 border-gray-800 bg-white shadow-lg">
      <div className="border-b-2 border-gray-800 p-6">
        <h2 className="mb-2 text-2xl font-bold">Improve Your Prompt</h2>
        <p className="text-gray-600">
          {isLoading
            ? "Generating context-aware questions..."
            : "Answer these questions to get better results!"}
        </p>
      </div>

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-blue-600" />
            <p className="text-gray-600">Analyzing your prompt...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="mb-4 text-red-600">
              Failed to generate custom questions
            </p>
            <p className="text-sm text-gray-500">
              Using fallback questions instead
            </p>
          </div>
        ) : null}

        {!isLoading && questions.length > 0 && (
          <>
            {questions.map((question: Question) => (
              <div
                key={question.id}
                className="overflow-hidden rounded-lg border-2 border-gray-800"
              >
                <Button
                  type="button"
                  onClick={() => toggleSection(question.id)}
                  variant="ghost"
                  className="flex w-full items-start gap-3 p-4 transition-colors hover:bg-gray-50"
                >
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-800 font-bold text-white">
                    {question.id}
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-lg font-semibold">{question.title}</h3>
                  </div>
                  {expandedSection === question.id ? (
                    <ChevronUp className="mt-1 h-5 w-5 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="mt-1 h-5 w-5 flex-shrink-0" />
                  )}
                </Button>

                {expandedSection === question.id && (
                  <div className="border-t border-gray-200 p-4 pt-0">
                    <p className="mb-4 ml-10 text-sm text-gray-600">
                      {question.description}
                    </p>

                    <div className="ml-10">
                      <Textarea
                        value={formData[question.field]}
                        onChange={(e) =>
                          handleInputChange(question.field, e.target.value)
                        }
                        placeholder="Type your answer here..."
                        className="w-full resize-none rounded-lg border-2 border-gray-300 p-3"
                        rows={3}
                      />

                      <div className="mt-4">
                        <p className="mb-2 text-sm font-medium text-gray-700">
                          Examples
                        </p>
                        <div className="space-y-2">
                          {question.examples.map((example, idx) => (
                            <Button
                              key={idx}
                              onClick={() =>
                                handleExampleClick(question.field, example)
                              }
                              variant="ghost"
                              className="group flex w-full items-center justify-between rounded-lg border-2 border-gray-300 p-3 text-left text-sm transition-colors hover:border-gray-400 hover:bg-gray-50"
                            >
                              <span className="flex-1">{example}</span>
                              <Plus className="h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-gray-600" />
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {!isLoading && (
          <div className="pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!isComplete}
              variant="ghost"
              className={`w-full rounded-lg px-6 py-3 font-semibold transition-colors ${
                isComplete
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "cursor-not-allowed bg-gray-200 text-gray-400"
              }`}
            >
              {isComplete
                ? "Optimize with Context"
                : "Answer at least one question to continue"}
            </Button>

            <Button
              onClick={() =>
                onComplete(initialPrompt, {
                  specificAspects: "",
                  backgroundLevel: "",
                  intendedUse: "",
                })
              }
              variant="ghost"
              className="mt-2 w-full py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Skip and optimize without context
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptImprovementForm;
