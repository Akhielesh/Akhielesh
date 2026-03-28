import os
import subprocess
import re

def extract_script(html_file):
    with open(html_file, 'r') as f:
        content = f.read()

    match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
    if match:
        return match.group(1)
    return None

def test_redirect(html_file, url_to_mock, expected_url):
    script_content = extract_script(html_file)
    if not script_content:
        print(f"No script found in {html_file}")
        return False

    # Mock the DOM environment for Node.js execution
    node_script = f"""
    const url_mock = "{url_to_mock}";
    const window = {{
        location: {{
            href: url_mock,
            replace: function(url) {{
                console.log("REDIRECT_URL:" + url);
            }}
        }}
    }};

    {script_content}
    """

    with open('temp_script.js', 'w') as f:
        f.write(node_script)

    try:
        result = subprocess.run(['node', 'temp_script.js'], capture_output=True, text=True, check=True)
        output = result.stdout
        for line in output.split('\\n'):
            if line.startswith("REDIRECT_URL:"):
                actual_url = line.replace("REDIRECT_URL:", "").strip()
                if actual_url == expected_url:
                    print(f"✅ {html_file} correctly redirects {url_to_mock} to {expected_url}")
                    return True
                else:
                    print(f"❌ {html_file} redirect failed. Expected: {expected_url}, Got: {actual_url}")
                    return False

        print(f"❌ No redirect occurred for {html_file} with URL {url_to_mock}")
        return False
    finally:
        if os.path.exists('temp_script.js'):
            os.remove('temp_script.js')

if __name__ == "__main__":
    tests = [
        ("index.html", "https://akhielesh.github.io/Akhielesh/", "https://akhielesh.com/"),
        ("index.html", "https://akhielesh.github.io/Akhielesh/about", "https://akhielesh.com/about"),
        ("index.html", "https://akhielesh.github.io/Akhielesh/projects?sort=recent", "https://akhielesh.com/projects?sort=recent"),
        ("index.html", "https://akhielesh.github.io/Akhielesh/#contact", "https://akhielesh.com/#contact"),
        ("404.html", "https://akhielesh.github.io/Akhielesh/missing", "https://akhielesh.com/missing"),
    ]

    all_passed = True
    for html_file, mock_url, expected in tests:
        if not test_redirect(html_file, mock_url, expected):
            all_passed = False

    if all_passed:
        print("All tests passed! 🎉")
    else:
        print("Some tests failed. 😢")
        exit(1)
