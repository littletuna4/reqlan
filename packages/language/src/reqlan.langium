/**
 * Reqlan surface syntax for requirement documents.
 * Interacts with the requirement graph model: ideas, ideasets, imports, and references.
 */
grammar Reqlan

entry Model:
    (NL* imports+=Import)*
    (NL* elements+=TopLevelElement)*
    NL*;

TopLevelElement:
    SimpleIdea | Idea | IdeaSet;

Idea:
    name=IdeaName '{'
        (NL* elements+=BodyElement)*
    NL* '}';

SimpleIdea:
    name=IdeaName tokens+=SimpleIdeaTextToken+;

SimpleIdeaTextToken returns string:
    ID | WORD | BodyPunctuation | PUNCTUATION | 'from' | 'import' | 'as' | '(' | ')';

IdeaSet:
    name=ID '(' NL*
        members+=[Idea:IdeaMemberName] (NL* ',' NL* members+=[Idea:IdeaMemberName])*
    NL* ')';

IdeaMemberName returns string:
    ID | STRING;

IdeaName returns string:
    ID | STRING;

BodyElement:
    WikiLink | BracketReference | Attribute | BodyLine;

BodyLine:
    parts+=InlinePart+;

InlinePart:
    WikiLink | BracketReference | text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

BodyPunctuation returns string:
    '.' | ',' | ':' | ';' | '!' | '?' | '-';

Attribute:
    '@' name=ID (negated?='!')? (':' value=AttributeValue)?;

AttributeValue:
    BlockValue | ListValue | ScalarValue;

BlockValue:
    '{' (NL* elements+=BlockElement)* NL* '}';

BlockElement:
    WikiLink | BracketReference | Attribute | NamedList | NestedList | BlockLine;

BlockLine:
    parts+=InlinePart+;

NamedList:
    label=ID '(' NL*
        items+=ListItem (NL+ items+=ListItem | NL* ',' NL* items+=ListItem)*
    NL* ')';

NestedList:
    '(' NL*
        items+=ListItem (NL+ items+=ListItem | NL* ',' NL* items+=ListItem)*
    NL* ')';

ListValue:
    '(' NL*
        items+=ListItem (NL+ items+=ListItem | NL* ',' NL* items+=ListItem)*
    NL* ')';

ListItem:
    WikiLink | BracketReference | tokens+=ListItemToken+;

ListItemToken:
    text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

ScalarValue:
    tokens+=ScalarToken+;

ScalarToken:
    text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

WikiLink:
    '[[' target=ReferenceTarget ('|' alias+=AliasPart+)? ']]';

AliasPart:
    text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

BracketReference:
    '[' target=ReferenceTarget ']';

ReferenceTarget:
    path=[Import:STRING] '.' idea=[Idea:ID]
    | qualifier=[Import:ID] '.' idea=[Idea:ID]
    | idea=[Idea:ID];

Import:
    FromImport | NamespaceImport | QualifiedImport;

FromImport:
    'from' path=STRING 'import' idea=[Idea:ID] ('as' alias=ID)?;

NamespaceImport:
    'import' path=STRING ('as' alias=ID)?;

QualifiedImport:
    'import' path=STRING '.' ideaset=ID '.' idea=[Idea:ID] ('as' alias=ID)?;

TextToken returns string:
    ID | WORD | 'from' | 'import' | 'as';

terminal NL: /\r?\n/;
hidden terminal WS: /[ \t]+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
terminal WORD: /[A-Za-z_][\w']*/;
terminal PUNCTUATION: /[^\s\w\{(\@"\[\]]+/;
