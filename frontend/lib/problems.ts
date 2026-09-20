export interface PracticeProblem {
  id: string;
  topic: string;
  equation: string;
  prompt: string;
  hints: string[];
  steps: { equation: string; explanation: string }[];
  visual: "groups" | "balance" | "parts";
  visualCaption: string;
}

export const PRACTICE_PROBLEMS: PracticeProblem[] = [
  {
    id: "distribution", topic: "Distributive property", equation: "2(x + 3) = 14",
    prompt: "Find x. Show your thinking, one step at a time.",
    hints: ["Look at the 2 outside the parentheses. Which terms inside does it multiply?", "Both terms get multiplied: 2 × x and 2 × 3. What does that give you?", "After expanding, remove the constant from both sides. Then divide by the coefficient of x."],
    steps: [{equation:"2x + 6 = 14",explanation:"Multiply both terms inside the parentheses by 2."},{equation:"2x = 8",explanation:"Subtract 6 from both sides to keep the equation balanced."},{equation:"x = 4",explanation:"Divide both sides by 2."},{equation:"2(4 + 3) = 14 ✓",explanation:"Check by substituting 4 into the original equation."}],
    visual:"groups", visualCaption:"Two groups of (x + 3). The 2 multiplies everything inside, including the 3.",
  },
  {
    id: "balance", topic: "Two-step equations", equation: "3x + 5 = 20",
    prompt: "Find x. Keep both sides of the equation balanced.",
    hints: ["Think of the equation as a balance. What could you remove from both sides first?", "Subtract 5 from both sides. How much is left on the right?", "Three equal x's now add up to 15. What is the value of one x?"],
    steps: [{equation:"3x = 15",explanation:"Subtract 5 from both sides."},{equation:"x = 5",explanation:"Divide both sides by 3."},{equation:"3(5) + 5 = 20 ✓",explanation:"Substitute 5 to check your answer."}],
    visual:"balance", visualCaption:"Each side has the same value. Whatever you remove from one side, remove from the other.",
  },
  {
    id: "fractions", topic: "Equations with fractions", equation: "x ÷ 4 + 2 = 5",
    prompt: "Find x. Work backward to uncover the whole.",
    hints: ["What operation would undo the + 2? Remember to do it to both sides.", "One quarter of x is now 3. How many quarters make a whole?", "Multiply both sides by 4 to find all of x."],
    steps: [{equation:"x ÷ 4 = 3",explanation:"Subtract 2 from both sides."},{equation:"x = 12",explanation:"Multiply both sides by 4."},{equation:"12 ÷ 4 + 2 = 5 ✓",explanation:"Substitute 12 to check your answer."}],
    visual:"parts", visualCaption:"The bar is one whole x, divided into four equal parts. The equation starts with just one of those parts.",
  },
];
