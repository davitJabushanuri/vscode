const { postprocessCompletion } = require("./dist/extension.js")

// Test cases for comment-to-code transitions
const testCases = [
	{
		name: "Comment to function - root level",
		prefix: "// write a function to calculate factorial",
		completion: "function factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}",
		language: "typescript",
		expected: "\nfunction factorial(n) {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}",
	},
	{
		name: "Comment to function - inside function",
		prefix: "function outer() {\n  // write a helper function\n}",
		completion: "function helper() {\n  return true;\n}",
		language: "typescript",
		expected: "\n  function helper() {\n    return true;\n  }",
	},
	{
		name: "Comment to code - with existing indentation",
		prefix: "  // add some logic here",
		completion: "const result = calculate();\nreturn result;",
		language: "typescript",
		expected: "\n  const result = calculate();\n  return result;",
	},
]

function runTests() {
	console.log("Running postprocessing tests...\n")

	testCases.forEach((testCase, index) => {
		console.log(`Test ${index + 1}: ${testCase.name}`)

		const options = {
			prefix: testCase.prefix,
			suffix: "",
			language: testCase.language,
			filePath: "test.ts",
		}

		const result = postprocessCompletion(testCase.completion, options)

		console.log("Input completion:", JSON.stringify(testCase.completion))
		console.log("Result:", JSON.stringify(result))
		console.log("Expected:", JSON.stringify(testCase.expected))
		console.log("Match:", result === testCase.expected ? "✅" : "❌")
		console.log("---\n")
	})
}

runTests()
