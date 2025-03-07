export function makeCodeBlock(text, language = "") {
  return `\`\`\`${language}
${text}
\`\`\``;
}
