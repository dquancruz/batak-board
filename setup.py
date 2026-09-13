"""Legacy shim so ``pip install -e .`` works on old pip too.

All real project metadata lives in ``pyproject.toml``. Pip >=21.3 supports
PEP 660 editable installs from that alone, but older pip (e.g. the system
pip on Raspberry Pi OS Buster's Python 3.7, which this project must run on
-- see requirements-pi.txt) falls back to the legacy ``setup.py develop``
mechanism for ``-e``, which requires an actual setup.py to exist at all.
setuptools>=61 still reads the ``[project]`` table from pyproject.toml with
this file present, so nothing is duplicated here.
"""

from setuptools import setup

setup()
