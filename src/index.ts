import { parse, type ParseOptions, type AST } from '@handlebars/parser';
import { SourceNode } from 'source-map/lib/source-node.js';

type Statement =
    | AST.MustacheStatement
    | AST.BlockStatement
    | AST.PartialStatement
    | AST.PartialBlockStatement
    | AST.ContentStatement
    | AST.CommentStatement;

type Literal =
    | AST.StringLiteral
    | AST.BooleanLiteral
    | AST.NumberLiteral
    | AST.UndefinedLiteral
    | AST.NullLiteral;

type Expression = AST.SubExpression | AST.PathExpression | Literal;

type CompileOptions = ParseOptions & {
    inputVar?: string;
    dataVar?: string;
    functionName?: string;
    omitComments?: boolean;
};

function compileProgram(
    ast: AST.Program,
    opts: CompileOptions & { depth: number },
    scope: (SourceNode | string)[]
): SourceNode {
    const sourceNode = new SourceNode(
        ast.loc?.start?.line,
        ast.loc?.start?.column,
        opts.srcName ?? null
    );
    sourceNode.add('""');
    if (ast.body && ast.body.length > 0) {
        for (let i = 0; i < ast.body.length; i++) {
            sourceNode.add(' + ');
            sourceNode.add(compileStatement(ast.body[i] as Statement, opts, scope));
        }
    }
    return sourceNode;
}

function compileStatement(
    ast: Statement,
    opts: CompileOptions & { depth: number },
    scope: (string | SourceNode)[]
): SourceNode {
    switch (ast.type) {
        case 'ContentStatement': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null,
                JSON.stringify(ast.value)
            );
        }
        case 'CommentStatement': {
            if (opts?.omitComments) {
                return new SourceNode();
            }
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null,
                `""/* ${ast.value.replace(/\*\//g, '')} */`
            );
        }
        case 'MustacheStatement': {
            const sourceNode: SourceNode = new SourceNode();
            if (ast.params.length > 0) {
                sourceNode.add(compileFunctionCall(ast, opts, scope));
            } else {
                sourceNode.add(compileExpression(ast.path as Expression, opts, scope));
            }
            if (ast.escaped) {
                sourceNode.prepend('e(');
                sourceNode.add(')');
            }
            return sourceNode;
        }
        case 'BlockStatement': {
            switch (ast.path.original) {
                case 'if':
                case 'unless': {
                    const sourceNode: SourceNode = new SourceNode(
                        ast.loc.start.line,
                        ast.loc.start.column,
                        opts.srcName ?? null
                    );
                    const condition = compileExpression(ast.params[0] as Expression, opts, scope);
                    const positive = compileProgram(ast.program, opts, scope);
                    const negative = ast.inverse ? compileProgram(ast.inverse, opts, scope) : '""';
                    const left = ast.path.original === 'if' ? positive : negative;
                    const right = ast.path.original === 'if' ? negative : positive;
                    sourceNode.add('(');
                    sourceNode.add(condition);
                    sourceNode.add(' ? ');
                    sourceNode.add(left);
                    sourceNode.add(' : ');
                    sourceNode.add(right);
                    sourceNode.add(')');
                    return sourceNode;
                }
                case 'each': {
                    const sourceNode: SourceNode = new SourceNode(
                        ast.loc.start.line,
                        ast.loc.start.column,
                        opts.srcName ?? null
                    );
                    const src = compileExpression(ast.params[0] as Expression, opts, scope);
                    sourceNode.add('Object.keys(');
                    sourceNode.add(src);
                    sourceNode.add(`).map(key${opts.depth} => (`);
                    sourceNode.add(
                        compileProgram(ast.program, { ...opts, depth: opts.depth + 1 }, [
                            ...scope,
                            `[key${opts.depth}]`
                        ])
                    );
                    sourceNode.add(')).join("")');
                    return sourceNode;
                }
                default: {
                    throw new Error(
                        `Unexpected ${ast.path.original} at ${ast.loc.start.line}:${ast.loc.start.column}`
                    );
                }
            }
        }
        default:
            throw new Error(
                `Unexpected ${ast.type} at ${ast.loc.start.line}:${ast.loc.start.column}`
            );
    }
}

function compileExpression(
    ast: Expression,
    opts: CompileOptions & { depth: number },
    scope: (string | SourceNode)[]
): SourceNode {
    switch (ast.type) {
        case 'PathExpression': {
            const sourceNode: SourceNode = new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null
            );
            if (ast.data) {
                switch (ast.original) {
                    case '@key':
                    case '@index': {
                        if (opts.depth === 0) {
                            throw new Error(
                                `Unexpected ${ast.original} at ${ast.loc.start.line}:${ast.loc.start.column}`
                            );
                        }
                        sourceNode.add(`key${opts.depth - 1}`);
                        return sourceNode;
                    }
                }
                switch (ast.head) {
                    case 'root': {
                        sourceNode.add(opts.inputVar!);
                        break;
                    }
                    case 'this': {
                        sourceNode.add(opts.inputVar!);
                        sourceNode.add(scope);
                        break;
                    }
                    default: {
                        sourceNode.add(opts.dataVar!);
                        break;
                    }
                }
            } else {
                sourceNode.add(opts.inputVar!);
                sourceNode.add(scope);
            }
            sourceNode.add(
                ast.parts
                    .map((part) => [
                        '[',
                        typeof part === 'string'
                            ? JSON.stringify(part)
                            : compileExpression(part, opts, scope),
                        ']'
                    ])
                    .flat()
            );
            return sourceNode;
        }
        case 'StringLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null,
                JSON.stringify(ast.value)
            );
        }
        case 'BooleanLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null,
                ast.value ? 'true' : 'false'
            );
        }
        case 'NumberLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null,
                ast.value.toString()
            );
        }
        case 'UndefinedLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null,
                'undefined'
            );
        }
        case 'NullLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                opts.srcName ?? null,
                'null'
            );
        }
        default: {
            throw new Error(
                `Unexpected ${ast.type} at ${ast.loc.start.line}:${ast.loc.start.column}`
            );
        }
    }
}

function compileFunctionCall(
    ast: AST.MustacheStatement,
    opts: CompileOptions & { depth: number },
    scope: (string | SourceNode)[]
): SourceNode {
    const sourceNode: SourceNode = new SourceNode(
        ast.loc.start.line,
        ast.loc.start.column,
        opts?.srcName ?? null
    );
    sourceNode.add(compileExpression(ast.path as Expression, opts, scope));
    sourceNode.add('(');
    for (let i = 0; i < ast.params.length; i++) {
        sourceNode.add(compileExpression(ast.params[i] as Expression, opts, scope));
        if (i < ast.params.length - 1) {
            sourceNode.add(', ');
        }
    }
    sourceNode.add(')');
    return sourceNode;
}

export function compile(
    str: string,
    options?: CompileOptions
): { code: string; sourceMap: string } {
    options = {
        inputVar: 'input',
        dataVar: 'data',
        ...(options ?? {})
    };
    const ast: AST.Program = parse(str, options);
    const sourceNode: SourceNode = new SourceNode();
    sourceNode.add('import escapeHTML from "@eslym/tinybars/runtime";\n\n');
    sourceNode.add('export default function ');
    if (options.functionName) {
        sourceNode.add(options.functionName);
    }
    sourceNode.add(`(${options.inputVar}, ${options.dataVar} = {}, e = escapeHTML){\n    return `);
    sourceNode.add(compileProgram(ast, { ...options!, depth: 0 }, []));
    sourceNode.add(';\n}');
    const res = sourceNode.toStringWithSourceMap({
        file: options?.srcName
    });
    return {
        code: res.code,
        sourceMap: res.map.toString()
    };
}
