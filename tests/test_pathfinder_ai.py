import pathfinder_ai


def test_version():
    """Test that the package version is a string."""
    assert isinstance(pathfinder_ai.__version__, str)


def test_import():
    """Test that the package imports successfully."""
    assert pathfinder_ai.__name__ == "pathfinder_ai"
