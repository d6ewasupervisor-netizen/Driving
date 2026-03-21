/**
 * Question Reformatter
 * Re-presents missed questions in alternative formats for better learning
 */

import { 
  Question, 
  AlternativeFormat, 
  TrueFalseQuestion, 
  ScenarioQuestion 
} from "@/types/quiz";

/**
 * Generate a True/False version of a question
 */
export function generateTrueFalse(question: Question): TrueFalseQuestion {
  const isTrue = Math.random() > 0.5;
  
  if (isTrue) {
    return {
      statement: `${question.question.replace("?", ".")} The correct answer is: ${question.correctAnswer}`,
      correctAnswer: true
    };
  } else {
    // Use a random wrong answer
    const wrongAnswer = question.wrongAnswers[Math.floor(Math.random() * question.wrongAnswers.length)];
    return {
      statement: `${question.question.replace("?", ".")} The correct answer is: ${wrongAnswer}`,
      correctAnswer: false
    };
  }
}

/**
 * Generate a Scenario version of a question
 */
export function generateScenario(question: Question): ScenarioQuestion {
  const scenarios = [
    `Ali is driving The Pink Menace down the highway when`,
    `While cruising through traffic,`,
    `Mya the cat suddenly hisses at the window. Ali needs to focus because`,
    `The K-pop emergency broadcast just ended. Now Ali must decide:`,
    `Gracie points a paw at the road ahead. The situation is:`,
  ];
  
  const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  
  return {
    setup: `${randomScenario} ${question.question}`,
    correctAction: question.correctAnswer,
    incorrectActions: question.wrongAnswers
  };
}

/**
 * Generate a Fill-in-the-Blank version (returns the question with blanks)
 */
export function generateFillBlank(question: Question): {
  statement: string;
  correctAnswer: string;
  hint: string;
} {
  // Create a fill-in-the-blank by hiding the answer
  const hint = question.correctAnswer.charAt(0) + "_".repeat(question.correctAnswer.length - 1);
  
  return {
    statement: `Complete the statement: ${question.question.replace("?", "")} The answer is _______.`,
    correctAnswer: question.correctAnswer,
    hint
  };
}

/**
 * Get an alternative format for a question
 * Avoids using the same format that was last used
 */
export function getAlternativeFormat(
  question: Question, 
  previousFormat: string
): { type: AlternativeFormat; data: TrueFalseQuestion | ScenarioQuestion | ReturnType<typeof generateFillBlank> } {
  const formats: AlternativeFormat[] = ["true_false", "scenario", "fill_blank"];
  const availableFormats = formats.filter(f => f !== previousFormat);
  const selectedFormat = availableFormats[Math.floor(Math.random() * availableFormats.length)];
  
  switch (selectedFormat) {
    case "true_false":
      return { type: "true_false", data: generateTrueFalse(question) };
    case "scenario":
      return { type: "scenario", data: generateScenario(question) };
    case "fill_blank":
      return { type: "fill_blank", data: generateFillBlank(question) };
    default:
      return { type: "scenario", data: generateScenario(question) };
  }
}

/**
 * Get format display name for UI
 */
export function getFormatDisplayName(format: AlternativeFormat): string {
  switch (format) {
    case "true_false":
      return "True or False";
    case "scenario":
      return "Road Scenario";
    case "fill_blank":
      return "Fill in the Blank";
    default:
      return "Multiple Choice";
  }
}
