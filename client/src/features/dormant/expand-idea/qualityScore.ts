export function calculateQualityScore(
  inputPrompt: string,
  outputPrompt: string,
): number {
  let score = 0;
  const inputWords = inputPrompt.split(/\s+/).length;
  const outputWords = outputPrompt.split(/\s+/).length;

  // Length improvement
  if (outputWords > inputWords * 2) score += 25;
  else if (outputWords > inputWords) score += 15;

  // Structure (sections with headers)
  const sections = (outputPrompt.match(/\*\*/g) || []).length / 2;
  score += Math.min(sections * 10, 30);

  // Key components
  if (outputPrompt.includes("Goal")) score += 15;
  if (
    outputPrompt.includes("Return Format") ||
    outputPrompt.includes("Research")
  )
    score += 15;
  if (outputPrompt.includes("Context") || outputPrompt.includes("Learning"))
    score += 15;

  return Math.min(score, 100);
}
