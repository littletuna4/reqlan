/**
 * Implementation of the rules described in reqlan rq/language/syntax.rq.
 *
 * Design:
 * - Imports and top-level declarations are line-oriented; import/from/as are keywords only there.
 * - One-liner ideas are name + body on a single line; block ideas use braces for rich content.
 * - ReferenceTarget covers local members, import-qualified, alias-qualified, and file targets.
 */
grammar Reqlan

// ---------------------------------------------------------------------------
// file_layout, keywords
// ---------------------------------------------------------------------------

entry Model:
    (NL* imports+=Import)*
    (NL* elements+=TopLevelElement)*
    NL*;

// Nameless `{ ... }` at top level is recoverable (no_name_idea_safe_warning):
// parse it, warn, and keep later ideas/imports intact — do not abort the file.
TopLevelElement:
    Idea | IdeaSet | OneLinerIdea | AnonymousBlock;

// ---------------------------------------------------------------------------
// idea_name, one_liner_idea, block_idea, ideaset
// ---------------------------------------------------------------------------

OneLinerIdea:
    name=IdeaName body=OneLinerBody?;

OneLinerBody:
    content+=(MarkdownLink | BracketReference | WikiLink | OneLinerText)+;

IdeaDeclaration:
    Idea | OneLinerIdea;

Idea:
    name=IdeaName '{'
        (NL* elements+=BodyElement)*
    NL* '}';

IdeaSet:
    name=IdeaName '(' NL*
        members+=[IdeaDeclaration:IdeaMemberName] (NL* ',' NL* members+=[IdeaDeclaration:IdeaMemberName])*
    NL* ')';

IdeaName returns string:
    ID | STRING;

IdeaMemberName returns string:
    ID | STRING;

ReferenceName returns string:
    ID;

// ---------------------------------------------------------------------------
// block_idea body, reference_embedding, code_snippets
// ---------------------------------------------------------------------------

BodyElement:
    Attribute | CodeSnippet | NamedList | NestedList | BodyLine;

BodyLine:
    parts+=RichTextPart+;

// PlainText already includes PlainPunctuation — do not also offer a punct= alt
// (that overlap is an LL ambiguity Chevrotain reports at parser construction).
RichTextPart:
    MarkdownLink | WikiLink | BracketReference | inlineCode=INLINE_CODE | text=PlainText | lparen='(' | rparen=')';

InlineTextPart:
    MarkdownLink | WikiLink | BracketReference | inlineCode=INLINE_CODE | text=PlainText;

CodeSnippet:
    raw=CODE_FENCE;

// ---------------------------------------------------------------------------
// one-liner body (same line only; ends at newline)
// ---------------------------------------------------------------------------

OneLinerText returns string:
    WORD | ID | NUMBER | INLINE_CODE | OTHER | WILDCARD_NAME | PlainPunctuation | '(' | ')' | '|' | 'from' | 'import' | 'as' | '`';

// PlainText must not include INLINE_CODE — that terminal is its own RichTextPart/InlineTextPart alt.
PlainText returns string:
    WORD | ID | NUMBER | OTHER | WILDCARD_NAME | PlainPunctuation | '[' | ']' | '|' | 'from' | 'import' | 'as' | '`';

PlainPunctuation returns string:
    '.' | ',' | ':' | ';' | '!' | '?' | '-';

// ---------------------------------------------------------------------------
// attribute_marker, attribute_forms, attribute_values
// ---------------------------------------------------------------------------

// `!` is either the negated flag or absent — never the start of a value.
// `:` is the legacy scalar separator and must not also start a ScalarValue.
Attribute:
    '@' name=ID (
        negated?='!'
      | ':' value=AttributeValue
      | value=AttributeValue
    )?;

AttributeValue:
    BlockValue | ListValue | ScalarValue;

ScalarValue:
    parts+=NonBangInlineTextPart parts+=InlineTextPart*;

NonBangInlineTextPart:
    MarkdownLink | WikiLink | BracketReference | inlineCode=INLINE_CODE | text=NonBangPlainText;

// No '!' (negated flag) and no leading ':' (attribute separator).
NonBangPlainText returns string:
    WORD | ID | NUMBER | OTHER | WILDCARD_NAME | NonBangPunctuation | '[' | ']' | '|' | 'from' | 'import' | 'as' | '`';

NonBangPunctuation returns string:
    '.' | ',' | ';' | '?' | '-';

BlockValue:
    '{' (NL* elements+=BlockElement)* NL* '}';

BlockElement:
    Attribute | CodeSnippet | NamedList | NestedList | BlockLine;

BlockLine:
    parts+=RichTextPart+;

// ---------------------------------------------------------------------------
// lists (comma- or newline-separated one-liners or nameless blocks)
// ---------------------------------------------------------------------------

ListValue:
    '(' NL* items+=ListItem ((NL* ',' NL* | NL+) items+=ListItem)* NL* (',' NL*)? ')';

NamedList:
    label=ID '(' NL+ items+=ListItem ((NL* ',' NL* | NL+) items+=ListItem)* NL* (',' NL*)? ')';

NestedList:
    '(' NL+ items+=ListItem ((NL* ',' NL* | NL+) items+=ListItem)* NL* (',' NL*)? ')';

ListItem:
    OneLinerListItem | AnonymousBlock | NamedBlockListItem | NestedList;

OneLinerListItem:
    body=ListItemBody;

// List item text omits ',' and ')' so separators and the closing paren are not
// swallowed by OneLinerText (which allows both for free-form one-liner ideas).
ListItemBody:
    content+=(MarkdownLink | BracketReference | WikiLink | ListItemText)+;

ListItemText returns string:
    WORD | ID | NUMBER | INLINE_CODE | OTHER | WILDCARD_NAME | ListItemPunctuation | '(' | '|' | 'from' | 'import' | 'as' | '`';

ListItemPunctuation returns string:
    '.' | ':' | ';' | '!' | '?' | '-';

NamedBlockListItem:
    name=ID '{' (NL* elements+=BodyElement)* NL* '}';

AnonymousBlock:
    '{' (NL* elements+=BodyElement)* NL* '}';

// ---------------------------------------------------------------------------
// markdown_links, reference_wikilink, reference_brackets, reference_qualified, reference_file
// ---------------------------------------------------------------------------

MarkdownLink:
    raw=MARKDOWN_LINK;

WikiLink:
    '[[' target=ReferenceTarget ('|' alias+=AliasPart+)? ']]';

AliasPart:
    text=PlainText;

BracketReference:
    '[' target=ReferenceTarget ']';

// Order and shape chosen so alternatives do not share a common LL prefix:
// - WildcardReference is STRING.WILDCARD_NAME (idea pattern must contain * or ?)
// - QualifiedReference covers STRING.ID / ID.ID (incl. idea.attribute surface form)
// - FileSymbolReference only for STRING.ID.ID.ID+ (3+ symbol segments)
// - FileReference is bare STRING
// - LocalReference is a bare local name
ReferenceTarget:
    WildcardReference | QualifiedReference | FileSymbolReference | FileReference | LocalReference;

FileReference:
    file=STRING;

FileSymbolReference:
    file=STRING '.' symbols+=ID '.' symbols+=ID '.' symbols+=ID ('.' symbols+=ID)*;

// Path may include globs (* ** ?); ideaPattern must include * or ? so exact qualified refs stay QualifiedReference.
WildcardReference:
    pathPattern=STRING '.' ideaPattern=WILDCARD_NAME;

QualifiedReference:
    (path=[Import:STRING] | qualifier=[Import:ID]) '.'
    (ideaset=[IdeaSet:ReferenceName] '.')? idea=[IdeaDeclaration:ReferenceName];

LocalReference:
    idea=[IdeaDeclaration:ReferenceName];

// ---------------------------------------------------------------------------
// import_from, import_namespace, import_qualified, import_tokenisation — see imports.rq
// InvalidFromImport recovers unquoted/malformed `from` lines so later ideas still parse.
// FromImport allows a mistaken `from "path" as alias` shape for a local diagnostic
// (valid form still requires `import` + idea specifiers).
// When a specifier/qualified import has `as alias`, only `alias` binds locally; the
// imported idea's base name stays free for a local idea declaration.
// ---------------------------------------------------------------------------

Import:
    FromImport | NamespaceImport | QualifiedImport | InvalidFromImport;

FromImport:
    'from' path=STRING (
        'import' specifiers+=FromImportSpecifier (',' specifiers+=FromImportSpecifier)*
      | 'as' alias=ID
    )?;

// Binding name is `alias` when present, otherwise the imported idea name.
FromImportSpecifier:
    idea=[IdeaDeclaration:ID] ('as' alias=ID)?;

NamespaceImport:
    'import' path=STRING ('as' alias=ID)?;

// Binding name is `alias` when present, otherwise the imported idea name.
QualifiedImport:
    'import' path=STRING '.' ideaset=ID '.' idea=[IdeaDeclaration:ID] ('as' alias=ID)?;

// `from` not followed by a quoted path — consume the rest of the line.
InvalidFromImport:
    'from' head=InvalidImportHeadToken tokens+=InvalidImportToken*;

InvalidImportHeadToken returns string:
    ID | WORD | NUMBER | OTHER | WILDCARD_NAME | PlainPunctuation | '(' | ')' | '|' | 'as' | 'import' | 'from' | '`' | '[' | ']';

InvalidImportToken returns string:
    ID | STRING | WORD | NUMBER | OTHER | WILDCARD_NAME | PlainPunctuation | '(' | ')' | '|' | 'as' | 'import' | 'from' | '`' | '[' | ']';

// ---------------------------------------------------------------------------
// comments, string_literals
// ---------------------------------------------------------------------------

terminal NL: /\r?\n/;
hidden terminal WS: /[ \t]+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

terminal MARKDOWN_LINK: /\[(?!\[)[^\]]+\]\([^)]+\)/;
terminal ID: /[_a-zA-Z][\w-]*/;
// Must contain * or ? so it does not steal ordinary ID tokens.
terminal WILDCARD_NAME: /\*[\w*?-]*|\?[\w*?-]*|[_a-zA-Z][\w-]*[*?][\w*?-]*/;
terminal STRING: /"(\\.|[^"\\\r\n])*"|'(\\.|[^'\\\r\n])*'/;
terminal NUMBER: /\d+/;
terminal WORD: /[A-Za-z_][\w']*/;
terminal OTHER: /[^\s\w\[\]()`]/;
terminal INLINE_CODE: /`[^`\n]+`/;
terminal CODE_FENCE: /```[^\n]*(?:\r?\n[\s\S]*?)?```/;
