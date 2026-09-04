#!/usr/bin/env python3
"""Generate TypeScript API types from FastAPI OpenAPI.

Parses FastAPI app.openapi() and emits frontend/src/api/generated.ts
and frontend/src/api/openapi.json.

This ensures frontend types are generated from the single source of truth
(FastAPI Pydantic contracts) - not duplicate handwritten wire types.

Usage:
    python scripts/generate_types.py
    or
    python -m scripts.generate_types
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from datetime import datetime, timezone

# Resolve project root
try:
    ROOT = Path(__file__).resolve().parents[1]
    if not (ROOT / "backend").exists():
        raise ValueError()
except Exception:
    ROOT = Path.cwd()


def _sanitize_name(name: str) -> str:
    # Ensure valid TS identifier
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    if re.match(r"^[0-9]", name):
        name = "_" + name
    return name


def json_schema_to_ts(schema: dict, definitions: dict, depth: int = 0) -> str:
    """Convert JSON schema to TypeScript type string."""
    if not isinstance(schema, dict):
        return "any"
    # $ref
    if "$ref" in schema:
        ref = schema["$ref"]
        # e.g., "#/components/schemas/NetworkNode"
        name = ref.split("/")[-1]
        return _sanitize_name(name)
    # enum as union of string literals
    if "enum" in schema:
        vals = schema["enum"]
        # Handle null enum?
        union = " | ".join(json.dumps(v) for v in vals)
        # If also has type null? Keep as union
        # If nullable, allow | null? We'll handle anyOf later
        return union
    # const
    if "const" in schema:
        return json.dumps(schema["const"])
    # anyOf / oneOf / allOf
    if "anyOf" in schema:
        parts = [json_schema_to_ts(s, definitions, depth + 1) for s in schema["anyOf"]]
        # Filter empty
        parts = [p for p in parts if p]
        return " | ".join(parts) if parts else "any"
    if "oneOf" in schema:
        parts = [json_schema_to_ts(s, definitions, depth + 1) for s in schema["oneOf"]]
        parts = [p for p in parts if p]
        return " | ".join(parts) if parts else "any"
    if "allOf" in schema:
        parts = [json_schema_to_ts(s, definitions, depth + 1) for s in schema["allOf"]]
        parts = [p for p in parts if p]
        return " & ".join(parts) if parts else "any"

    t = schema.get("type")

    # Handle nullable via type array like ["string","null"]
    if isinstance(t, list):
        # e.g., ["string", "null"]
        types = []
        has_null = "null" in t
        for sub_t in t:
            if sub_t == "null":
                continue
            pseudo = dict(schema)
            pseudo["type"] = sub_t
            # remove enum? keep but type string already
            types.append(json_schema_to_ts(pseudo, definitions, depth + 1))
        union = " | ".join(types) if types else "any"
        if has_null:
            union += " | null"
        return union

    if t == "string":
        if "enum" in schema:
            return " | ".join(json.dumps(v) for v in schema["enum"])
        # format date-time etc still string
        return "string"
    if t == "integer" or t == "number":
        return "number"
    if t == "boolean":
        return "boolean"
    if t == "array":
        items = schema.get("items", {})
        inner = json_schema_to_ts(items, definitions, depth + 1) if items else "any"
        # Handle nullable items? items may have anyOf with null
        return f"{inner}[]"
    if t == "object":
        # If has properties, inline object type
        if "properties" in schema:
            props = schema["properties"]
            required = set(schema.get("required", []))
            lines = []
            for prop_name, prop_schema in props.items():
                ts_type = json_schema_to_ts(prop_schema, definitions, depth + 1)
                optional = "" if prop_name in required else "?"
                # sanitize prop name if needed (if contains hyphen etc)
                if re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", prop_name):
                    lines.append(f"  {prop_name}{optional}: {ts_type};")
                else:
                    lines.append(f'  "{prop_name}"{optional}: {ts_type};')
            # additionalProperties handling
            addl = schema.get("additionalProperties")
            if isinstance(addl, dict):
                addl_type = json_schema_to_ts(addl, definitions, depth + 1)
                lines.append(f"  [key: string]: {addl_type};")
            elif addl is True:
                lines.append(f"  [key: string]: any;")
            if not lines:
                return "Record<string, any>"
            return "{\n" + "\n".join(lines) + "\n}"
        # additionalProperties only
        if "additionalProperties" in schema:
            addl = schema["additionalProperties"]
            if isinstance(addl, dict):
                val_type = json_schema_to_ts(addl, definitions, depth + 1)
                return f"Record<string, {val_type}>"
            elif addl is True:
                return "Record<string, any>"
        # free-form object
        return "Record<string, any>"
    # If no type but has properties, treat as object
    if "properties" in schema:
        return json_schema_to_ts({"type": "object", "properties": schema["properties"], "required": schema.get("required", []), "additionalProperties": schema.get("additionalProperties")}, definitions, depth + 1)
    # Fallback any
    # If schema empty, any
    return "any"


def generate():
    """Main generation logic."""
    import sys
    sys.path.insert(0, str(ROOT / "backend"))

    try:
        from app.main import app
    except Exception as e:
        # Fallback import via backend.app.main
        sys.path.insert(0, str(ROOT))
        from backend.app.main import app  # type: ignore

    # Ensure state loaded before openapi generation (so schemas are registered)
    try:
        from app.state import load_state
        load_state()
    except Exception:
        try:
            from backend.app.state import load_state
            load_state()
        except Exception:
            pass

    openapi = app.openapi()
    # Save openapi.json
    api_dir = ROOT / "frontend" / "src" / "api"
    api_dir.mkdir(parents=True, exist_ok=True)
    openapi_path = api_dir / "openapi.json"
    with openapi_path.open("w", encoding="utf-8") as f:
        json.dump(openapi, f, indent=2, sort_keys=True)
    print(f"[generate_types] Saved OpenAPI to {openapi_path.relative_to(ROOT)}")

    schemas = openapi.get("components", {}).get("schemas", {})
    # Sort schemas alphabetically for determinism
    sorted_schemas = dict(sorted(schemas.items()))

    # Build TS output
    lines: list[str] = []
    lines.append("// Auto-generated from FastAPI OpenAPI - do not edit manually")
    lines.append(f"// Generated at {datetime.now(timezone.utc).isoformat()} from backend Pydantic contracts")
    lines.append("// Source: FastAPI app.openapi() - single source of truth")
    lines.append("// Distinguishes observed/predicted/simulated states with different labels and styles")
    lines.append("")
    lines.append("/* eslint-disable */")
    lines.append("// @ts-nocheck - auto-generated")
    lines.append("")

    # Add helper types
    lines.append("// Utility helper for nullable")
    lines.append("export type Nullable<T> = T | null;")
    lines.append("")

    # Emit each schema as interface or type
    for schema_name, schema_def in sorted_schemas.items():
        ts_name = _sanitize_name(schema_name)
        # Decide if schema is object with properties -> interface, else type alias
        if schema_def.get("type") == "object" or "properties" in schema_def or "allOf" in schema_def or "anyOf" in schema_def:
            # If schema has properties at top level, emit interface
            if "properties" in schema_def or schema_def.get("type") == "object":
                # Check if it's really an object with properties
                if "properties" in schema_def:
                    # Build interface
                    description = schema_def.get("description", "")
                    if description:
                        lines.append(f"/** {description} */")
                    lines.append(f"export interface {ts_name} {{")
                    props = schema_def.get("properties", {})
                    required = set(schema_def.get("required", []))
                    for prop_name, prop_schema in props.items():
                        ts_type = json_schema_to_ts(prop_schema, sorted_schemas)
                        optional = "" if prop_name in required else "?"
                        prop_desc = prop_schema.get("description", "")
                        if prop_desc:
                            lines.append(f"  /** {prop_desc} */")
                        # sanitize prop name
                        if re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", prop_name):
                            lines.append(f"  {prop_name}{optional}: {ts_type};")
                        else:
                            lines.append(f'  "{prop_name}"{optional}: {ts_type};')
                    # additionalProperties
                    addl = schema_def.get("additionalProperties")
                    if isinstance(addl, dict):
                        val_type = json_schema_to_ts(addl, sorted_schemas)
                        lines.append(f"  [key: string]: {val_type};")
                    elif addl is True:
                        lines.append(f"  [key: string]: any;")
                    lines.append("}")
                    lines.append("")
                else:
                    # object without properties but maybe additionalProperties -> type alias
                    ts_type = json_schema_to_ts(schema_def, sorted_schemas)
                    desc = schema_def.get("description", "")
                    if desc:
                        lines.append(f"/** {desc} */")
                    lines.append(f"export type {ts_name} = {ts_type};")
                    lines.append("")
            else:
                # anyOf etc at top level -> type alias
                ts_type = json_schema_to_ts(schema_def, sorted_schemas)
                desc = schema_def.get("description", "")
                if desc:
                    lines.append(f"/** {desc} */")
                lines.append(f"export type {ts_name} = {ts_type};")
                lines.append("")
        else:
            # non-object -> type alias
            ts_type = json_schema_to_ts(schema_def, sorted_schemas)
            desc = schema_def.get("description", "")
            if desc:
                lines.append(f"/** {desc} */")
            lines.append(f"export type {ts_name} = {ts_type};")
            lines.append("")

    # If no schemas were emitted (should not happen), add fallback
    if not sorted_schemas:
        lines.append("// No schemas found - fallback")
        lines.append("export type Any = any;")
        lines.append("")

    # Add API client helper types for routes (optional but useful)
    lines.append("// ---------------------------------------------------------------------------")
    lines.append("// API route helpers - generated from OpenAPI paths")
    lines.append("// ---------------------------------------------------------------------------")
    paths = openapi.get("paths", {})
    for path, methods in sorted(paths.items()):
        for method, details in sorted(methods.items()):
            if method.startswith("x-"):
                continue
            operation_id = details.get("operationId", f"{method}_{path.replace('/', '_').replace('{', '').replace('}', '')}")
            summary = details.get("summary", "")
            tag = ""
            if details.get("tags"):
                tag = f" [{', '.join(details['tags'])}]"
            lines.append(f"// {method.upper()} {path}{tag} - {summary}")
            # Could emit function signatures, but keep comment

    lines.append("")
    lines.append("// Generated API paths for reference")
    lines.append("export const API_PATHS = {")
    for path in sorted(paths.keys()):
        # create const name
        const_name = re.sub(r"[^a-zA-Z0-9]", "_", path.strip("/").replace("/", "_").replace("{", "").replace("}", "")) or "root"
        const_name = const_name.upper()
        lines.append(f'  {const_name}: "{path}",')
    lines.append("} as const;")
    lines.append("")
    lines.append("// Engine metadata type alias for convenience")
    lines.append("export type EngineState = \"observed\" | \"predicted\" | \"simulated\" | \"ground_truth\";")
    lines.append("")

    output = "\n".join(lines)
    generated_path = api_dir / "generated.ts"
    with generated_path.open("w", encoding="utf-8") as f:
        f.write(output)
    print(f"[generate_types] Generated TypeScript types to {generated_path.relative_to(ROOT)} ({len(sorted_schemas)} schemas, {len(output.splitlines())} lines)")

    # Verify file contains required types
    required_types = ["NetworkNode", "Forecast", "EngineMetadata", "ScenarioFrame", "EvaluationMetrics", "SimulationResult"]
    missing = []
    for req in required_types:
        if req not in output:
            # Check sanitized? Maybe schema name slightly different like NetworkNode etc
            # Search case-insensitive
            if req.lower() not in output.lower():
                missing.append(req)
    if missing:
        print(f"[generate_types] WARNING: Missing expected types {missing} - schemas available: {list(sorted_schemas.keys())[:10]}")
    else:
        print(f"[generate_types] Verified required types present: {required_types}")

    return generated_path, openapi_path


if __name__ == "__main__":
    generate()
