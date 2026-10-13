//! Layout card chrome, heading tips, and column-span defaults for interactive HTML export.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_layout_cards]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_heading_tooltips]

use crate::html_utils::escape_html;

pub(crate) const LAYOUT_COLUMNS: u8 = 12;

pub(crate) fn heading_tip_attr(tip: &str) -> String {
    let trimmed = tip.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!(r#" data-heading-tip="{}" tabindex="0""#, escape_html(trimmed))
    }
}

pub(crate) fn default_layout_span(classes: &str) -> u8 {
    if classes.contains("layout-card-span-full")
        || classes.contains("table-shell")
        || classes.contains("graph-shell")
    {
        LAYOUT_COLUMNS
    } else {
        LAYOUT_COLUMNS / 2
    }
}

pub(crate) fn layout_card_controls(layout_id: &str) -> String {
    let id = escape_html(layout_id);
    format!(
        r#"<button type="button" class="layout-card-toggle" aria-expanded="true" aria-controls="layout-body-{id}" data-layout-toggle aria-label="Collapse or expand"></button>"#
    )
}

fn layout_card_resize_handle() -> &'static str {
    r#"<span class="layout-card-resize" data-layout-resize role="separator" aria-orientation="vertical" aria-label="Resize card width. Double-click to fill or restore row." tabindex="0"></span>"#
}

pub(crate) fn render_layout_card(
    layout_id: &str,
    tag: &str,
    classes: &str,
    heading: &str,
    heading_tip: &str,
    body: &str,
    extra_attrs: &str,
) -> String {
    let id = escape_html(layout_id);
    let tip = heading_tip_attr(heading_tip);
    let controls = layout_card_controls(layout_id);
    let span = default_layout_span(classes);
    let extra = if extra_attrs.is_empty() { String::new() } else { format!(" {extra_attrs}") };
    format!(
        r#"<{tag} class="{classes} layout-card" data-layout-id="{id}" data-layout-span="{span}" style="--layout-span: {span}"{extra}>
            <div class="layout-card-head" draggable="true" data-layout-drag>
                {controls}
                <h2{tip}>{heading}</h2>
            </div>
            <div class="layout-card-body" id="layout-body-{id}">{body}</div>
            {resize}
        </{tag}>"#,
        heading = escape_html(heading),
        resize = layout_card_resize_handle(),
    )
}

pub(crate) fn render_layout_card_with_actions(
    layout_id: &str,
    tag: &str,
    classes: &str,
    heading: &str,
    heading_tip: &str,
    actions: &str,
    body: &str,
    extra_attrs: &str,
) -> String {
    let id = escape_html(layout_id);
    let tip = heading_tip_attr(heading_tip);
    let controls = layout_card_controls(layout_id);
    let span = default_layout_span(classes);
    let extra = if extra_attrs.is_empty() { String::new() } else { format!(" {extra_attrs}") };
    format!(
        r#"<{tag} class="{classes} layout-card" data-layout-id="{id}" data-layout-span="{span}" style="--layout-span: {span}"{extra}>
            <div class="layout-card-head toolbar" draggable="true" data-layout-drag>
                {controls}
                <h2{tip}>{heading}</h2>
                <div class="actions">{actions}</div>
            </div>
            <div class="layout-card-body" id="layout-body-{id}">{body}</div>
            {resize}
        </{tag}>"#,
        heading = escape_html(heading),
        resize = layout_card_resize_handle(),
    )
}

pub(crate) fn render_entity_layout_card(
    layout_id: &str,
    href: Option<&str>,
    title: &str,
    subtitle: &str,
    heading_tip: &str,
    prefix_html: &str,
) -> String {
    let id = escape_html(layout_id);
    let tip = heading_tip_attr(if heading_tip.is_empty() { subtitle } else { heading_tip });
    let controls = layout_card_controls(layout_id);
    let title_html = if let Some(href) = href {
        format!(r#"<a href="{}">{}</a>"#, escape_html(href), escape_html(title))
    } else {
        escape_html(title)
    };
    let subtitle_html = if subtitle.is_empty() {
        String::new()
    } else {
        format!(r#"<p class="subtle">{}</p>"#, escape_html(subtitle))
    };
    // Entity tiles stay drag-reorderable and collapsible; they are not width-resizable.
    format!(
        r#"<div class="entity-card layout-card" data-layout-id="{id}">
            <div class="layout-card-head" draggable="true" data-layout-drag>
                {controls}
                <h3{tip}>{title_html}</h3>
            </div>
            <div class="layout-card-body" id="layout-body-{id}">{prefix_html}{subtitle_html}</div>
        </div>"#
    )
}
