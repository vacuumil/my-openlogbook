import math
from datetime import datetime, timezone
from astral import Observer
from astral.sun import elevation

def get_great_circle_intermediate_point(lat1: float, lon1: float, lat2: float, lon2: float, f: float) -> tuple[float, float]:
    """Calculate intermediate point along great circle path at fraction f (0.0 to 1.0)"""
    r_lat1 = math.radians(lat1)
    r_lon1 = math.radians(lon1)
    r_lat2 = math.radians(lat2)
    r_lon2 = math.radians(lon2)

    d = 2 * math.asin(
        math.sqrt(
            math.sin((r_lat1 - r_lat2) / 2) ** 2
            + math.cos(r_lat1) * math.cos(r_lat2) * math.sin((r_lon1 - r_lon2) / 2) ** 2
        )
    )

    if d == 0:
        return lat1, lon1

    a = math.sin((1 - f) * d) / math.sin(d)
    b = math.sin(f * d) / math.sin(d)

    x = a * math.cos(r_lat1) * math.cos(r_lon1) + b * math.cos(r_lat2) * math.cos(r_lon2)
    y = a * math.cos(r_lat1) * math.sin(r_lon1) + b * math.cos(r_lat2) * math.sin(r_lon2)
    z = a * math.sin(r_lat1) + b * math.sin(r_lat2)

    lat = math.atan2(z, math.sqrt(x**2 + y**2))
    lon = math.atan2(y, x)

    return math.degrees(lat), math.degrees(lon)

def calculate_astronomical_night_time(
    dep_lat: float,
    dep_lon: float,
    arr_lat: float,
    arr_lon: float,
    off_time: datetime,
    on_time: datetime,
    twilight_threshold_deg: float = -6.0 # EASA Civil Twilight standard
) -> int:
    """
    Calculates night flight duration in minutes based on solar elevation below -6 degrees
    along the great circle flight trajectory.
    """
    if on_time <= off_time:
        return 0

    total_seconds = (on_time - off_time).total_seconds()
    total_minutes = int(total_seconds / 60)

    # Sample trajectory every 5 minutes (minimum 6 samples)
    step_minutes = 5
    num_steps = max(6, int(total_minutes / step_minutes))
    step_duration_minutes = total_minutes / num_steps

    night_minutes = 0.0

    for i in range(num_steps):
        fraction = (i + 0.5) / num_steps
        current_time = off_time + (on_time - off_time) * fraction
        lat, lon = get_great_circle_intermediate_point(dep_lat, dep_lon, arr_lat, arr_lon, fraction)

        obs = Observer(latitude=lat, longitude=lon)
        try:
            sun_elev = elevation(obs, current_time)
            if sun_elev <= twilight_threshold_deg:
                night_minutes += step_duration_minutes
        except Exception:
            pass

    return round(night_minutes)
