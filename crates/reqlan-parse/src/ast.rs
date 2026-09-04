//! Index-path AST matching reqlan.langium productions.
//! rq:["../../../reqlan rq/ontology.rq".grammar_rule]
//! rq:["../../../reqlan rq/ontology.rq".idea]
//! rq:["../../../reqlan rq/ontology.rq".import_statement]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]

use crate::token::Span;

#[derive(Debug, Clone)]
pub struct Model {
    pub span: Span,
    pub imports: Vec<Import>,
    pub elements: Vec<TopLevelElement>,
}

#[derive(Debug, Clone)]
pub enum Import {
    From(FromImport),
    Namespace(NamespaceImport),
    Qualified(QualifiedImport),
    InvalidFrom(InvalidFromImport),
}

#[derive(Debug, Clone)]
pub struct FromImport {
    pub span: Span,
    pub path: String,
    pub specifiers: Vec<FromImportSpecifier>,
    pub alias: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FromImportSpecifier {
    pub span: Span,
    pub idea: String,
    pub alias: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NamespaceImport {
    pub span: Span,
    pub path: String,
    pub alias: Option<String>,
}

#[derive(Debug, Clone)]
pub struct QualifiedImport {
    pub span: Span,
    pub path: String,
    pub ideaset: String,
    pub idea: String,
    pub alias: Option<String>,
}

#[derive(Debug, Clone)]
pub struct InvalidFromImport {
    pub span: Span,
    pub text: String,
}

#[derive(Debug, Clone)]
pub enum TopLevelElement {
    Idea(Idea),
    IdeaSet(IdeaSet),
    OneLiner(OneLinerIdea),
    Anonymous(AnonymousBlock),
}

#[derive(Debug, Clone)]
pub struct Idea {
    pub span: Span,
    pub name: String,
    pub elements: Vec<BodyElement>,
}

#[derive(Debug, Clone)]
pub struct IdeaSet {
    pub span: Span,
    pub name: String,
    pub members: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct OneLinerIdea {
    pub span: Span,
    pub name: String,
    pub body: Vec<RichPart>,
}

#[derive(Debug, Clone)]
pub struct AnonymousBlock {
    pub span: Span,
    pub elements: Vec<BodyElement>,
}

#[derive(Debug, Clone)]
pub enum BodyElement {
    Attribute(Attribute),
    CodeSnippet(CodeSnippet),
    NamedList(NamedList),
    NestedList(NestedList),
    BodyLine(BodyLine),
}

#[derive(Debug, Clone)]
pub struct BodyLine {
    pub span: Span,
    pub parts: Vec<RichPart>,
}

#[derive(Debug, Clone)]
pub struct CodeSnippet {
    pub span: Span,
    pub raw: String,
}

#[derive(Debug, Clone)]
pub struct Attribute {
    pub span: Span,
    pub name: String,
    pub negated: bool,
    pub value: Option<AttributeValue>,
}

#[derive(Debug, Clone)]
pub enum AttributeValue {
    Scalar(ScalarValue),
    List(ListValue),
    Block(BlockValue),
}

#[derive(Debug, Clone)]
pub struct ScalarValue {
    pub span: Span,
    pub text: String,
    pub parts: Vec<RichPart>,
}

#[derive(Debug, Clone)]
pub struct ListValue {
    pub span: Span,
    pub items: Vec<ListItem>,
}

#[derive(Debug, Clone)]
pub struct BlockValue {
    pub span: Span,
    pub inner_text: String,
    pub elements: Vec<BodyElement>,
}

#[derive(Debug, Clone)]
pub struct NamedList {
    pub span: Span,
    pub label: String,
    pub items: Vec<ListItem>,
}

#[derive(Debug, Clone)]
pub struct NestedList {
    pub span: Span,
    pub items: Vec<ListItem>,
}

#[derive(Debug, Clone)]
pub enum ListItem {
    OneLiner(Vec<RichPart>),
    Anonymous(AnonymousBlock),
    NamedBlock(NamedBlockListItem),
    Nested(NestedList),
}

#[derive(Debug, Clone)]
pub struct NamedBlockListItem {
    pub span: Span,
    pub name: String,
    pub elements: Vec<BodyElement>,
}

#[derive(Debug, Clone)]
pub enum RichPart {
    Text { span: Span, text: String },
    InlineCode { span: Span, text: String },
    MarkdownLink { span: Span, raw: String },
    BracketRef { span: Span, target: ReferenceTarget },
    WikiLink { span: Span, target: ReferenceTarget, alias: Option<String> },
}

#[derive(Debug, Clone)]
pub enum ReferenceTarget {
    Local {
        span: Span,
        idea: String,
    },
    Qualified {
        span: Span,
        path: Option<String>,
        qualifier: Option<String>,
        ideaset: Option<String>,
        idea: String,
    },
    File {
        span: Span,
        file: String,
    },
    Url {
        span: Span,
        url: String,
    },
    FileSymbol {
        span: Span,
        file: String,
        symbols: Vec<String>,
    },
    Wildcard {
        span: Span,
        path_pattern: String,
        idea_pattern: String,
    },
}

impl Import {
    pub fn path(&self) -> Option<&str> {
        match self {
            Self::From(import) => Some(import.path.as_str()),
            Self::Namespace(import) => Some(import.path.as_str()),
            Self::Qualified(import) => Some(import.path.as_str()),
            Self::InvalidFrom(_) => None,
        }
    }

    pub fn is_namespace(&self) -> bool {
        matches!(self, Self::Namespace(_))
    }

    pub fn namespace_alias(&self) -> Option<&str> {
        match self {
            Self::Namespace(import) => import.alias.as_deref(),
            _ => None,
        }
    }
}

impl TopLevelElement {
    pub fn name(&self) -> Option<&str> {
        match self {
            Self::Idea(idea) => Some(idea.name.as_str()),
            Self::IdeaSet(set) => Some(set.name.as_str()),
            Self::OneLiner(idea) => Some(idea.name.as_str()),
            Self::Anonymous(_) => None,
        }
    }

    pub fn span(&self) -> Span {
        match self {
            Self::Idea(idea) => idea.span,
            Self::IdeaSet(set) => set.span,
            Self::OneLiner(idea) => idea.span,
            Self::Anonymous(block) => block.span,
        }
    }
}

impl RichPart {
    pub fn span(&self) -> Span {
        match self {
            Self::Text { span, .. }
            | Self::InlineCode { span, .. }
            | Self::MarkdownLink { span, .. }
            | Self::BracketRef { span, .. }
            | Self::WikiLink { span, .. } => *span,
        }
    }

    pub fn as_text(&self) -> String {
        match self {
            Self::Text { text, .. } => text.clone(),
            Self::InlineCode { text, .. } => text.clone(),
            Self::MarkdownLink { raw, .. } => raw.clone(),
            Self::BracketRef { .. } | Self::WikiLink { .. } => self.source_like(),
        }
    }

    fn source_like(&self) -> String {
        match self {
            Self::BracketRef { target, .. } => format!("[{}]", target.label()),
            Self::WikiLink { target, alias, .. } => {
                if let Some(alias) = alias {
                    format!("[[{}|{}]]", target.label(), alias)
                } else {
                    format!("[[{}]]", target.label())
                }
            }
            other => other.as_text(),
        }
    }
}

impl ReferenceTarget {
    pub fn span(&self) -> Span {
        match self {
            Self::Local { span, .. }
            | Self::Qualified { span, .. }
            | Self::File { span, .. }
            | Self::Url { span, .. }
            | Self::FileSymbol { span, .. }
            | Self::Wildcard { span, .. } => *span,
        }
    }

    pub fn label(&self) -> String {
        match self {
            Self::Local { idea, .. } => idea.clone(),
            Self::Qualified { qualifier, path, ideaset, idea, .. } => {
                let head = qualifier.clone().or(path.clone()).unwrap_or_default();
                match ideaset {
                    Some(set) => format!("{head}.{set}.{idea}"),
                    None => format!("{head}.{idea}"),
                }
            }
            Self::File { file, .. } => file.clone(),
            Self::Url { url, .. } => url.clone(),
            Self::FileSymbol { file, symbols, .. } => format!("{file}.{}", symbols.join(".")),
            Self::Wildcard { path_pattern, idea_pattern, .. } => {
                format!("{path_pattern}.{idea_pattern}")
            }
        }
    }
}

impl ListItem {
    /// Source text of this list item, matching Langium `$cstNode.text`.
    pub fn source_text(&self, source: &str) -> String {
        match self {
            Self::OneLiner(parts) => match (parts.first(), parts.last()) {
                (Some(first), Some(last)) => {
                    source.get(first.span().start..last.span().end).unwrap_or("").to_string()
                }
                _ => String::new(),
            },
            Self::Anonymous(block) => {
                source.get(block.span.start..block.span.end).unwrap_or("").to_string()
            }
            Self::NamedBlock(item) => {
                source.get(item.span.start..item.span.end).unwrap_or("").to_string()
            }
            Self::Nested(list) => {
                source.get(list.span.start..list.span.end).unwrap_or("").to_string()
            }
        }
    }
}
