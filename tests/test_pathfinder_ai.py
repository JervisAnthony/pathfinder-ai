import pathfinder_ai


def test_version():
    """Test that the package version matches the installed metadata."""
    from importlib.metadata import version

    # Assert version matches the installed package version.
    assert pathfinder_ai.__version__ == version("pathfinder-ai")


def test_import():
    """Test that the package imports successfully."""
    assert pathfinder_ai.__name__ == "pathfinder_ai"
