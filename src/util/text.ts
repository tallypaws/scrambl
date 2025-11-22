export function scramble(
  text: string,
  options: {
    preserveWords?: boolean;
    minimumDistance?: number;
    maxAttempts?: number;
  } = { preserveWords: true, minimumDistance: 2, maxAttempts: 50 }
): string {
  options = {
    preserveWords: true,
    minimumDistance: 2,
    maxAttempts: 50,
    ...options,
  };
  function run() {
    if (options.preserveWords) {
      return text
        .split(" ")
        .map((word) => scrambleSegment(word))
        .join(" ");
    } else {
      return scrambleSegment(text);
    }
  }
  let scrambled = run();
  let attempts = 0;
  while (
    levenshteinDistance(text, scrambled) < options.minimumDistance! &&
    attempts < options.maxAttempts!
  ) {
    scrambled = run();
    attempts++;
  }
  return scrambled;
}

function scrambleSegment(word: string): string {
  const chars = word.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
