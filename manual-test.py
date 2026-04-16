#!/usr/bin/env python3
"""
Manual end-to-end test for the HTML flow.
Tests: Upload -> Create Project -> Generate Recipe -> Apply Content -> Create Export
Verifies: Export is saved in server/projects/[projectName]/flows/[flowId]/exports/
"""

import json
import requests
import os
import sys
from pathlib import Path

BASE_URL = "http://localhost:3001"
PROJECT_ROOT = Path(__file__).parent

def print_header(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")

def print_step(step_num, title):
    print(f"\n[STEP {step_num}] {title}")
    print("-" * 70)

def test_upload_template():
    """Step 1: Upload HTML template"""
    print_step(1, "Upload HTML template")
    
    html_template = """<!DOCTYPE html>
<html>
<head>
    <title>Manual Test Template</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        section { page-break-after: always; padding: 20px; border: 1px solid #ccc; margin-bottom: 20px; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <section>
        <h1 data-zone="title">Title Placeholder</h1>
        <p data-zone="content">Content placeholder</p>
    </section>
    <section>
        <h2 data-zone="slide2_title">Slide 2 Title</h2>
        <p data-zone="slide2_content">Slide 2 Content</p>
    </section>
</body>
</html>"""
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/html-flow/upload-template",
            json={"html": html_template},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("ok"):
            template_id = data.get("templateId")
            slide_count = data.get("slideCount")
            print(f"[OK] Template uploaded successfully")
            print(f"   Template ID: {template_id}")
            print(f"   Slide count: {slide_count}")
            return template_id
        else:
            print(f"[FAIL] Upload failed: {data.get('error')}")
            return None
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return None

def test_create_project(template_id):
    """Step 2: Create project"""
    print_step(2, "Create project with selections")
    
    payload = {
        "templateId": template_id,
        "projectName": "ManualTestProject",
        "selections": [
            {
                "nodeId": "h1",
                "key": "title",
                "slideIndex": 0,
                "type": "leaf",
                "autoGenerate": True
            },
            {
                "nodeId": "p",
                "key": "content",
                "slideIndex": 0,
                "type": "leaf",
                "autoGenerate": True
            },
            {
                "nodeId": "h2",
                "key": "slide2_title",
                "slideIndex": 1,
                "type": "leaf",
                "autoGenerate": True
            },
            {
                "nodeId": "p[1]",
                "key": "slide2_content",
                "slideIndex": 1,
                "type": "leaf",
                "autoGenerate": True
            }
        ],
        "repeatableSlides": [],
        "fullSlideGeneration": []
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/html-flow/create-project",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("ok"):
            project_name = data.get("projectName")
            flow_id = data.get("flowId")
            zones = data.get("zones", [])
            print(f"[OK] Project created successfully")
            print(f"   Project name: {project_name}")
            print(f"   Flow ID: {flow_id}")
            print(f"   Zones: {len(zones)}")
            
            # Verify flow.json was created
            flow_json_path = PROJECT_ROOT / "server" / "projects" / project_name / "flows" / flow_id / "flow.json"
            if flow_json_path.exists():
                print(f"[OK] flow.json created at: {flow_json_path}")
                with open(flow_json_path) as f:
                    flow_data = json.load(f)
                    print(f"   Generations in flow.json: {len(flow_data.get('generations', []))}")
            else:
                print(f"[FAIL] flow.json NOT found at: {flow_json_path}")
            
            return project_name, flow_id
        else:
            print(f"[FAIL] Project creation failed: {data.get('error')}")
            return None, None
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return None, None

def test_generate_recipe(project_name, flow_id):
    """Step 3: Generate recipe"""
    print_step(3, "Generate recipe")
    
    payload = {
        "projectName": project_name,
        "flowId": flow_id,
        "globalPrompt": "Test prompt for manual testing"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/html-flow/generate-recipe",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("ok"):
            recipe = data.get("recipe", "")
            print(f"[OK] Recipe generated successfully")
            print(f"   Recipe length: {len(recipe)} characters")
            return True
        else:
            print(f"[FAIL] Recipe generation failed: {data.get('error')}")
            return False
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False

def test_apply_content(project_name, flow_id):
    """Step 4: Apply content"""
    print_step(4, "Apply content to template")
    
    json_response = {
        "title": "My Test Title",
        "content": "This is my test content",
        "slide2_title": "Second Slide Title",
        "slide2_content": "Second slide content here"
    }
    
    payload = {
        "projectName": project_name,
        "flowId": flow_id,
        "jsonString": json.dumps(json_response)
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/html-flow/apply-content",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("ok"):
            output_file = data.get("outputFile")
            round_id = data.get("roundId")
            slide_count = data.get("slideCount")
            
            print(f"[OK] Content applied successfully")
            print(f"   Output file: {output_file}")
            print(f"   Round ID: {round_id}")
            print(f"   Slide count: {slide_count}")
            
            # Verify output file exists
            flow_dir = PROJECT_ROOT / "server" / "projects" / project_name / "flows" / flow_id
            output_path = flow_dir / output_file
            if output_path.exists():
                file_size = output_path.stat().st_size
                print(f"[OK] Output file exists at: {output_path}")
                print(f"   File size: {file_size} bytes")
            else:
                print(f"[FAIL] Output file NOT found at: {output_path}")
            
            # Verify flow.json was updated
            flow_json_path = flow_dir / "flow.json"
            if flow_json_path.exists():
                with open(flow_json_path) as f:
                    flow_data = json.load(f)
                    generations = flow_data.get('generations', [])
                    print(f"[OK] flow.json updated")
                    print(f"   Generations in flow.json: {len(generations)}")
                    if generations:
                        latest_gen = generations[-1]
                        print(f"   Latest generation ID: {latest_gen.get('id')}")
            
            return output_file, round_id
        else:
            print(f"[FAIL] Apply content failed: {data.get('error')}")
            return None, None
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return None, None

def test_create_export(project_name, flow_id, output_file, round_id):
    """Step 5: Create export"""
    print_step(5, "Create export")
    
    payload = {
        "roundId": round_id,
        "outputFile": output_file,
        "slideMetadata": [
            {"slideId": "slide-1", "name": "Slide 1", "type": "content"},
            {"slideId": "slide-2", "name": "Slide 2", "type": "content"}
        ]
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/projects/{project_name}/flows/{flow_id}/exports",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("ok"):
            export_id = data.get("exportId")
            export_number = data.get("exportNumber")
            
            print(f"[OK] Export created successfully")
            print(f"   Export ID: {export_id}")
            print(f"   Export number: {export_number}")
            
            return export_id
        else:
            print(f"[FAIL] Export creation failed: {data.get('error')}")
            return None
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return None

def verify_export_structure(project_name, flow_id, export_id):
    """Step 6: Verify export folder structure"""
    print_step(6, "Verify export folder structure")
    
    export_dir = PROJECT_ROOT / "server" / "projects" / project_name / "flows" / flow_id / "exports" / export_id
    
    print(f"Expected export directory: {export_dir}")
    
    if not export_dir.exists():
        print(f"[FAIL] Export directory NOT found!")
        return False
    
    print(f"[OK] Export directory exists")
    
    # Check for expected files
    expected_files = ["export.json", "project.json"]
    found_files = []
    
    for item in export_dir.iterdir():
        found_files.append(item.name)
        if item.is_file():
            size = item.stat().st_size
            print(f"   [OK] {item.name} ({size} bytes)")
        elif item.is_dir():
            print(f"   [DIR] {item.name}/ (directory)")
    
    # Verify export.json
    export_json_path = export_dir / "export.json"
    if export_json_path.exists():
        with open(export_json_path) as f:
            export_data = json.load(f)
            print(f"\n[OK] export.json content:")
            print(f"   Export ID: {export_data.get('exportId')}")
            print(f"   Round ID: {export_data.get('roundId')}")
            print(f"   Created at: {export_data.get('createdAt')}")
    
    # Verify flow.json was updated
    flow_json_path = PROJECT_ROOT / "server" / "projects" / project_name / "flows" / flow_id / "flow.json"
    if flow_json_path.exists():
        with open(flow_json_path) as f:
            flow_data = json.load(f)
            exports = flow_data.get('exports', [])
            print(f"\n[OK] flow.json exports array updated")
            print(f"   Exports in flow.json: {len(exports)}")
            if exports:
                latest_export = exports[-1]
                print(f"   Latest export ID: {latest_export.get('exportId')}")
    
    print(f"\n[OK] Export structure verified successfully!")
    print(f"   Full path: {export_dir}")
    return True

def main():
    print_header("MANUAL END-TO-END TEST: HTML Flow with Export")
    print("Testing: Upload > Create Project > Generate Recipe > Apply Content > Create Export")
    print("Verifying: Export is in server/projects/[projectName]/flows/[flowId]/exports/[exportId]/")
    
    # Step 1: Upload template
    template_id = test_upload_template()
    if not template_id:
        print("\n[FAIL] Test failed at Step 1")
        sys.exit(1)
    
    # Step 2: Create project
    project_name, flow_id = test_create_project(template_id)
    if not project_name or not flow_id:
        print("\n[FAIL] Test failed at Step 2")
        sys.exit(1)
    
    # Step 3: Generate recipe
    if not test_generate_recipe(project_name, flow_id):
        print("\n[FAIL] Test failed at Step 3")
        sys.exit(1)
    
    # Step 4: Apply content
    output_file, round_id = test_apply_content(project_name, flow_id)
    if not output_file or not round_id:
        print("\n[FAIL] Test failed at Step 4")
        sys.exit(1)
    
    # Step 5: Create export
    export_id = test_create_export(project_name, flow_id, output_file, round_id)
    if not export_id:
        print("\n[FAIL] Test failed at Step 5")
        sys.exit(1)
    
    # Step 6: Verify export structure
    if not verify_export_structure(project_name, flow_id, export_id):
        print("\n[FAIL] Test failed at Step 6")
        sys.exit(1)
    
    print_header("[OK] ALL TESTS PASSED!")
    print(f"Project: {project_name}")
    print(f"Flow ID: {flow_id}")
    print(f"Export ID: {export_id}")
    print(f"\nExport location:")
    print(f"  server/projects/{project_name}/flows/{flow_id}/exports/{export_id}/")
    print()

if __name__ == "__main__":
    main()
