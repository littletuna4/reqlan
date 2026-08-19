#!/usr/bin/env python3

import argparse
import math
import xml.etree.ElementTree as ET


def _user_length(value: str | None, fallback: float) -> float:
    if value is None:
        return fallback
    return float(value.replace("px", "").strip())


def svg_center(root: ET.Element, diameter: float) -> tuple[float, float]:
    view_box = root.get("viewBox")
    if view_box:
        parts = view_box.replace(",", " ").split()
        if len(parts) == 4:
            min_x, min_y, vb_w, vb_h = (float(p) for p in parts)
            return min_x + vb_w / 2, min_y + vb_h / 2

    width = _user_length(root.get("width"), diameter)
    height = _user_length(root.get("height"), diameter)
    return width / 2, height / 2


def add_text_to_circle(
    input_svg: str,
    output_svg: str,
    diameter: float,
    text: str,
    rotation: float = 0,
    direction: int = 1,
    color: str = "#000000",
    fontsize: float = 24,
    border_color: str = "#2a211d",
    border_width: float = 12,
):
    tree = ET.parse(input_svg)
    root = tree.getroot()

    # SVG namespace
    SVG = "http://www.w3.org/2000/svg"
    ET.register_namespace("", SVG)
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")

    cx, cy = svg_center(root, diameter)
    r = diameter / 2

    # Put the circle at the requested center.
    defs = root.find(f"{{{SVG}}}defs")
    if defs is None:
        defs = ET.Element(f"{{{SVG}}}defs")
        root.insert(0, defs)

    path_id = "text-circle"
    sweep = 1 if direction == 1 else 0

    # Circle path. Start at the top. direction 1 = clockwise, -1 = counter-clockwise.
    path = ET.SubElement(
        defs,
        f"{{{SVG}}}path",
        {
            "id": path_id,
            "d": (
                f"M {cx},{cy - r} "
                f"A {r},{r} 0 1 {sweep} {cx},{cy + r} "
                f"A {r},{r} 0 1 {sweep} {cx},{cy - r}"
            ),
            "fill": "none",
        },
    )

    text_el = ET.SubElement(
        root,
        f"{{{SVG}}}text",
        {
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "transform": f"rotate({rotation} {cx} {cy})",
            "fill": color,
            "font-size": str(fontsize),
            "font-family": "inter, sans-serif",
            # character horizontal spacing
            "letter-spacing": "0.06em",
            # font weight
            "font-weight": "700",
            "stroke": border_color,
            "stroke-width": str(border_width),
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
            "paint-order": "stroke fill",
        },
    )

    text_path = ET.SubElement(
        text_el,
        f"{{{SVG}}}textPath",
        {
            "href": f"#{path_id}",
            "{http://www.w3.org/1999/xlink}href": f"#{path_id}",
            "startOffset": "50%",
            "text-anchor": "middle",
        },
    )
    text_path.text = text

    tree.write(output_svg, encoding="utf-8", xml_declaration=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_svg")
    parser.add_argument("output_svg")
    parser.add_argument("--diameter", type=float, required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--rotation", type=float, default=0)
    parser.add_argument(
        "--direction",
        type=int,
        choices=(1, -1),
        default=1,
        help="1 = clockwise text, -1 = flipped counter-clockwise text",
    )

    parser.add_argument("--color", default="#000000")
    parser.add_argument("--fontsize", type=float, default=24)
    parser.add_argument("--border-color", default="#2a211d")
    parser.add_argument("--border-width", type=float, default=12)

    args = parser.parse_args()

    add_text_to_circle(
        input_svg=args.input_svg,
        output_svg=args.output_svg,
        diameter=args.diameter,
        text=args.text,
        rotation=args.rotation,
        direction=args.direction,
        color=args.color,
        fontsize=args.fontsize,
        border_color=args.border_color,
        border_width=args.border_width,
    )


if __name__ == "__main__":
    # main()
    import os
    add_text_to_circle(
        input_svg=os.path.join(os.path.dirname(__file__), "ed-core with-bg.svg"),
        output_svg=os.path.join(os.path.dirname(__file__), "edtest-output.svg"),
        diameter=395,
        text="reqlan",
        rotation=-12,
        direction=-1,
        # color="rgb(246, 124, 109)",
        # color="rgb(246, 84, 39)",
        # color="rgb(207, 175, 142)",
        color="rgb(247, 215, 182)",
        fontsize=65,
        border_color="#2a211d",
        border_width=14,
    )