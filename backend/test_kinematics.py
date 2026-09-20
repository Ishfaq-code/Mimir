"""Run with: python -m unittest test_kinematics -v (from backend/)."""

import json
import math
import random
import re
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import (
    KINEMATICS_SCOPE,
    PhysicsExtraction,
    VISUALIZATION_CACHE,
    app,
    build_visualization,
    generate_kinematics_question,
)


def variables(frame):
    return {variable.name: variable.value for variable in frame.variables}


def solve(**knowns):
    return build_visualization(PhysicsExtraction.model_validate({
        "motion_type": "constant_acceleration_1d", **knowns,
    }))


PREMADE_SPEED_UP = (
    "A truck travels in a straight line at 0 m/s and accelerates uniformly at 3 m/s² for 4 s. "
    "Find its final speed and the distance it travels during this time."
)


class KinematicsTests(unittest.TestCase):
    def test_premade_demos_skip_provider(self):
        with patch("main.is_openrouter_visualization_configured", return_value=False), \
             patch("main.extract_physics", new_callable=AsyncMock) as provider:
            client = TestClient(app)
            response = client.post("/visualize", json={"topic": "kinematics", "problem": f"\n{PREMADE_SPEED_UP}\n"})
            self.assertEqual(response.status_code, 200, response.text)
            values = {v["name"]: v["value"] for v in response.json()["frames"][-1]["variables"]}
            self.assertEqual(values, {"t": 4, "x": 24, "v": 12, "a": 3})
            provider.assert_not_called()

    def test_api_extraction_drives_novel_problem_and_caches(self):
        import httpx
        extraction = {"status": "supported", "object_label": "train", "motion_type": "constant_acceleration_1d",
                      "initial_velocity": {"value": 36, "unit": "km/h"}, "acceleration": 0,
                      "duration": {"value": 2, "unit": "min"}}
        response = httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(extraction)}}]},
                                  request=httpx.Request("POST", "https://openrouter.ai"))
        problem = "A train travels at 36 km/h for two minutes at constant speed."
        VISUALIZATION_CACHE.clear()
        with patch("main.is_openrouter_visualization_configured", return_value=True), \
             patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key"}), \
             patch("main.httpx.AsyncClient.post", new_callable=AsyncMock, return_value=response) as post:
            client = TestClient(app)
            for _ in range(2):
                result = client.post("/visualize", json={"topic": "kinematics", "problem": problem})
                self.assertEqual(result.status_code, 200, result.text)
                values = {v["name"]: v["value"] for v in result.json()["frames"][-1]["variables"]}
                self.assertEqual(values, {"t": 120, "x": 1200, "v": 10, "a": 0})
                self.assertEqual(result.json()["frames"][0]["objects"][1]["label"], "train")
            self.assertEqual(post.await_count, 1)
            messages = post.call_args.kwargs["json"]["messages"]
            self.assertEqual(messages[-1], {"role": "user", "content": problem})
            self.assertEqual(messages[0]["role"], "system")

    def test_provider_failures_and_unsupported_reasons(self):
        import httpx
        cases = [
            ({"choices": [{"message": {"content": "not JSON"}}]}, 502, "unreadable"),
            ({"choices": [None]}, 502, "unreadable"),
            ({"choices": [{"message": {"content": json.dumps({"status": "unsupported", "reason": "Please supply the initial speed."})}}]}, 422, "initial speed"),
        ]
        for body, status, detail in cases:
            response = httpx.Response(200, json=body, request=httpx.Request("POST", "https://openrouter.ai"))
            with patch("main.is_openrouter_visualization_configured", return_value=True), \
                 patch.dict("os.environ", {"OPENROUTER_API_KEY": "test-key"}), \
                 patch("main.httpx.AsyncClient.post", new_callable=AsyncMock, return_value=response):
                result = TestClient(app).post("/visualize", json={"topic": "kinematics", "problem": "A moving object"})
                self.assertEqual(result.status_code, status)
                self.assertIn(detail, result.json()["detail"])

    def test_generated_text_and_frames_agree(self):
        # Check varied generated numbers against independently solved problem text.
        for kind in ("speed_up", "braking", "constant_speed", "free_fall"):
            for seed in range(50):
                with self.subTest(kind=kind, seed=seed):
                    question = generate_kinematics_question(kind, random.Random(seed))
                    numbers = [float(value) for value in re.findall(r"\d+(?:\.\d+)?", question.problem)]
                    if kind == "speed_up":
                        u, a, t = numbers
                    elif kind == "braking":
                        u, t = numbers
                        a = -u / t
                    elif kind == "constant_speed":
                        u, t = numbers
                        a = 0
                    else:
                        height, a = numbers
                        u, t = 0, math.sqrt(2 * height / a)
                    frames = question.visualization.frames
                    end = variables(frames[-1])
                    self.assertAlmostEqual(end["t"], t, places=3)
                    self.assertAlmostEqual(end["v"], u + a * t, places=3)
                    self.assertAlmostEqual(end["x"], u * t + 0.5 * a * t * t, places=3)
                    self.assertEqual(len(frames), 9)
                    self.assertGreater(question.visualization.timeline.step, 0)
                    previous_x = -1
                    for frame in frames:
                        values = variables(frame)
                        self.assertEqual(set(values), {"t", "x", "v", "a"})
                        self.assertGreaterEqual(values["x"], previous_x)
                        previous_x = values["x"]
                        self.assertAlmostEqual(values["v"] ** 2, u ** 2 + 2 * a * values["x"], delta=0.06)
                        objects = {obj.id: obj for obj in frame.objects}
                        if a == 0:
                            self.assertNotIn("acceleration", objects)
                        elif a < 0:
                            self.assertLess(objects["acceleration"].x2, objects["acceleration"].x)
                        if abs(values["v"]) < 1e-9:
                            self.assertNotIn("velocity", objects)
                        if kind == "free_fall":
                            self.assertNotIn("truck", objects)
                            self.assertEqual(objects["ball"].type, "circle")
                        for obj in objects.values():
                            for coordinate in (obj.x, obj.x2):
                                if coordinate is not None:
                                    self.assertTrue(0 <= coordinate <= 800)
                            for coordinate in (obj.y, obj.y2):
                                if coordinate is not None:
                                    self.assertTrue(0 <= coordinate <= 450)
                    json.dumps(question.model_dump(), allow_nan=False)

    def test_initial_final_velocity_and_time_regression(self):
        data = solve(initial_velocity=0, final_velocity=10, duration=5)
        self.assertEqual(variables(data.frames[-1]), {"t": 5, "x": 25, "v": 10, "a": 2})

    def test_constant_speed_distance_solves_time(self):
        data = solve(initial_velocity=5, acceleration=0, displacement=20)
        self.assertEqual(variables(data.frames[-1]), {"t": 4, "x": 20, "v": 5, "a": 0})

    def test_braking_from_stopping_distance(self):
        data = solve(initial_velocity=10, final_velocity=0, displacement=25)
        self.assertEqual(variables(data.frames[-1]), {"t": 5, "x": 25, "v": 0, "a": -2})

    def test_rejects_unreachable_inconsistent_and_reversing_motion(self):
        cases = [
            {"initial_velocity": 2, "acceleration": -2, "displacement": 10},
            {"initial_velocity": 2, "acceleration": -2, "duration": 5},
            {"initial_velocity": 2, "acceleration": 2, "duration": 0},
            {"initial_velocity": 2, "acceleration": 2, "duration": 5, "displacement": 99},
            {"initial_velocity": 2, "acceleration": 2, "duration": 5, "final_velocity": 99},
        ]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                solve(**case)

    def test_questions_work_without_provider(self):
        with patch("main.is_openrouter_visualization_configured", return_value=False), \
             patch("main.extract_physics", new_callable=AsyncMock) as provider:
            client = TestClient(app)
            for kind in ("speed_up", "braking", "constant_speed", "free_fall"):
                response = client.get("/visualize/question", params={"kind": kind})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(len(response.json()["visualization"]["frames"]), 9)
            self.assertEqual(client.get("/visualize/question?kind=collision").status_code, 422)
            provider.assert_not_called()

    def test_unsupported_model_has_actionable_scope_error(self):
        # Replay the two-ball model output observed during diagnosis.
        captured = {"motion_type": "constant_acceleration_1d", "initial_velocity": None,
                    "final_velocity": None, "displacement": 12, "duration": None, "acceleration": 9.8}
        async def replay(_request):
            return PhysicsExtraction.model_validate(captured)
        with patch("main.is_openrouter_visualization_configured", return_value=True), \
             patch("main.extract_physics", side_effect=replay):
            response = TestClient(app).post("/visualize", json={"topic": "kinematics", "problem": "Two balls start 12 m apart."})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], KINEMATICS_SCOPE)


if __name__ == "__main__":
    unittest.main()
