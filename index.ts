const CHARS = /[a-z0-9!@#\$%\^&\*\(\)-=_\+\[\]\{\};:,\.<>/\?]/i;
const WHITESPACE = /\s/;

function tokenize(input: string) {
	const tokens: string[] = [];
	let idx = 0;

	while (idx < input.length) {
		let char = input[idx];

		if (WHITESPACE.test(char)) {
			idx++;
			continue;
		}

		if (CHARS.test(char)) {
			let value = "";
			while (idx < input.length && CHARS.test(char)) {
				value += char;
				char = input[++idx];
			}
			tokens.push(value);
			continue;
		}

		if (char === '"') {
			let value = "";
			if (idx < input.length - 1) {
				char = input[++idx];
				while (char !== '"') {
					value += char;
					char = input[++idx];
				}
				if (char !== '"') {
					throw new Error("Error: Invalid String");
				}
				char = input[++idx];
			} else {
				throw new Error("Error: Invalid String");
			}
			tokens.push(`"${value}"`);
			continue;
		}

		throw new TypeError("Unknown Character: " + char);
	}

	return tokens;
}

enum Type {
	VARIABLE,
	FUNCTION,
	END,
	SET,
	STDOUT,
	RETURN,
	COND,
	ELSE,
	WHILE,
	REPEAT,
	CALL,
}

const STDOUT_COMMANDS = ["write", "say", "echo", "print"];

type CompileResult = {
	type: Type;
	data: {
		[key: string]: string | object | number | undefined | string[];
	};
}[];

export function compile(src: string): CompileResult {
	const lines = src
		.split(/\r?\n/)
		.map((ln) => ln.trim())
		.filter((ln) => ln.length > 0);

	function reduceArgs(args: string[]) {
		return args
			.reduce((result, value, index, array) => {
				if (index % 2 === 0) result.push(array.slice(index, index + 2));
				return result;
			}, [] as string[][])
			.map((arr) => ({ [arr[1]]: arr[0] }))
			.reduce((acc, curr) => ({ ...acc, ...curr }), {});
	}

	const TYPES = ["string", "number", "boolean"];

	const result = lines.map((ln) => {
		const [cmd, ...args] = tokenize(ln);

		if (TYPES.includes(cmd) && args[1] === "=") {
			return {
				type: Type.VARIABLE,
				data: {
					name: args[0],
					value: args.slice(2),
					type: cmd,
					constant: false,
				},
			};
		}

		if (cmd === "const" && TYPES.includes(args[0]) && args[2] === "=") {
			return {
				type: Type.VARIABLE,
				data: {
					name: args[1],
					value: args.slice(3),
					type: args[0],
					constant: true,
				},
			};
		}

		if (args[0] === "=") {
			return {
				type: Type.SET,
				data: { name: cmd, value: args.slice(1) },
			};
		}

		if (cmd === "func" && args[args.length - 2] === "->") {
			return {
				type: Type.FUNCTION,
				data: {
					name: args[0],
					args: reduceArgs(args.slice(1, args.length - 2)),
					returns: args[args.length - 1],
				},
			};
		}

		if (cmd === "end") {
			return {
				type: Type.END,
			};
		}

		if (STDOUT_COMMANDS.includes(cmd)) {
			return {
				type: Type.STDOUT,
				data: args,
			};
		}

		if (cmd === "return") {
			return {
				type: Type.RETURN,
				data: args,
			};
		}

		if (cmd === "if" || cmd === "elif") {
			return {
				type: Type.COND,
				data: {
					condition: args,
					elif: cmd === "elif",
				},
			};
		}

		if (cmd === "else") {
			return {
				type: Type.ELSE,
			};
		}

		if (cmd === "while") {
			return {
				type: Type.WHILE,
				data: {
					condition: args,
				},
			};
		}

		if (cmd === "repeat") {
			return {
				type: Type.REPEAT,
				data: {
					var: args[2],
					times: args[0],
				},
			};
		}

		return {
			type: Type.CALL,
			data: {
				name: cmd,
				args,
			},
		};
	});

	return result as CompileResult;
}

function compileToTS(code: CompileResult): string {
	const getType = (type: string) => (type === "float" ? "number" : type);

	function makeArgs(args: object) {
		const result = Object.entries(args)
			.map(([name, type]) => {
				return `${name}: ${type}`;
			})
			.join(", ");

		return result;
	}

	const result = code.map((code) => {
		if (code.type === Type.VARIABLE) {
			const { name, value, type, constant } = code.data;

			if (constant) {
				return `const ${name}: ${getType(type as string)} = ${(
					value as string[]
				).join(" ")};`;
			}

			return `let ${name}: ${getType(type as string)} = ${(
				value as string[]
			).join(" ")};`;
		}
		if (code.type === Type.FUNCTION) {
			const { name, args, returns } = code.data;

			return `function ${name}(${makeArgs(args as object)}): ${getType(
				returns as string
			)} {`;
		}
		if (code.type === Type.END) {
			return "}";
		}
		if (code.type === Type.SET) {
			const { name, value } = code.data;

			return `${name} = ${(value as string[]).join(" ")};`;
		}
		if (code.type === Type.STDOUT) {
			// @ts-ignore
			return `console.log(${(code.data as string[]).join(", ")});`;
		}
		if (code.type === Type.RETURN) {
			// @ts-ignore
			return `return ${(code.data as string[]).join(" ")};`;
		}
		if (code.type === Type.COND) {
			const { condition, elif } = code.data;

			return `${elif ? "} else " : ""}if (${(condition as string[]).join(
				" "
			)}) {`;
		}
		if (code.type === Type.ELSE) {
			return `} else {`;
		}
		if (code.type === Type.WHILE) {
			const { condition } = code.data;

			return `while (${(condition as string[]).join(" ")}) {`;
		}
		if (code.type === Type.REPEAT) {
			const { times, var: variable } = code.data;

			return `for (let ${variable} = 0; ${variable} < ${times}; ${variable}++) {`;
		}
		if (code.type === Type.CALL) {
			const { name, args } = code.data;

			return `${name}(${(args as string[]).join(", ")});`;
		}
	});

	return result.join("\n");
}

export default function build(src: string) {
	const tokens = compile(src);
	return compileToTS(tokens);
}
