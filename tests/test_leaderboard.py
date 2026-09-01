from batak_board.config import Difficulty
from batak_board.game.leaderboard import Leaderboard


def test_add_and_top_sorted_descending(tmp_path):
    board = Leaderboard(path=tmp_path / "leaderboard.json", max_entries=10)
    board.add("Ana", 5, Difficulty.EASY)
    board.add("Beto", 12, Difficulty.HARD)
    board.add("Cami", 8, Difficulty.MEDIUM)

    scores = [e.score for e in board.top()]
    assert scores == [12, 8, 5]


def test_persists_across_instances(tmp_path):
    path = tmp_path / "leaderboard.json"
    Leaderboard(path=path).add("Ana", 7, Difficulty.EASY)

    reloaded = Leaderboard(path=path)
    assert len(reloaded.top()) == 1
    assert reloaded.top()[0].name == "Ana"
    assert reloaded.top()[0].score == 7


def test_max_entries_is_enforced(tmp_path):
    board = Leaderboard(path=tmp_path / "leaderboard.json", max_entries=3)
    for score in [1, 2, 3, 4, 5]:
        board.add(f"P{score}", score, Difficulty.MEDIUM)

    top = board.top()
    assert len(top) == 3
    assert [e.score for e in top] == [5, 4, 3]


def test_missing_file_yields_empty_leaderboard(tmp_path):
    board = Leaderboard(path=tmp_path / "does-not-exist.json")
    assert board.top() == []


def test_corrupt_file_is_treated_as_empty(tmp_path):
    path = tmp_path / "leaderboard.json"
    path.write_text("{not valid json", encoding="utf-8")
    board = Leaderboard(path=path)
    assert board.top() == []


def test_blank_name_falls_back_to_default(tmp_path):
    board = Leaderboard(path=tmp_path / "leaderboard.json")
    entry = board.add("", 3, Difficulty.EASY)
    assert entry.name == "Player"
