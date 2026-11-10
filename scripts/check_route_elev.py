import json
import numpy as np

with open('public/data/terrain_height.bin', 'rb') as f:
    elev_data = np.frombuffer(f.read(), dtype=np.float32).reshape((1025, 1025))

with open('public/data/route.json', 'r') as f:
    route_data = json.load(f)
route = route_data['points']

errors = []
for pt in route:
    lx = pt['x']
    ly = pt['y']
    pt_elev = pt['elevation']
    
    col = (lx / 5000.0) * 1024.0
    row = (1.0 - (ly / 5000.0)) * 1024.0
    
    c0 = int(np.floor(col))
    c1 = min(c0 + 1, 1024)
    r0 = int(np.floor(row))
    r1 = min(r0 + 1, 1024)
    
    fc = col - c0
    fr = row - r0
    
    top = (1 - fc) * elev_data[r0, c0] + fc * elev_data[r0, c1]
    bot = (1 - fc) * elev_data[r1, c0] + fc * elev_data[r1, c1]
    dem_elev = (1 - fr) * top + fr * bot
    
    err = abs(pt_elev - dem_elev)
    errors.append(err)

errors = np.array(errors)
print(f"Total points checked: {len(errors)}")
print(f"Mean absolute elevation error: {np.mean(errors):.3f} m")
print(f"Max absolute elevation error: {np.max(errors):.3f} m")
print(f"Median elevation error: {np.median(errors):.3f} m")
print(f"RMSE: {np.sqrt(np.mean(errors**2)):.3f} m")

p_first = route[0]
p_last = route[-1]
col_first = (p_first['x'] / 5000.0) * 1024.0
row_first = (1.0 - (p_first['y'] / 5000.0)) * 1024.0

col_last = (p_last['x'] / 5000.0) * 1024.0
row_last = (1.0 - (p_last['y'] / 5000.0)) * 1024.0

print("\n--- FIRST ROUTE POINT ---")
print(f"Sol: {p_first['sol']}")
print(f"Local position: x = {p_first['x']:.2f} m, y = {p_first['y']:.2f} m")
print(f"Heightmap pixel: col = {col_first:.2f}, row = {row_first:.2f}")
print(f"World coordinates: Easting = {8140750.0 + p_first['x']:.2f} m, Northing = {-287375.0 + p_first['y']:.2f} m")
print(f"Mars Geographic: Longitude = {p_first['lon']:.6f} deg E, Latitude = {p_first['lat']:.6f} deg S")
print(f"Route elevation: {p_first['elevation']:.2f} m")

print("\n--- LAST ROUTE POINT ---")
print(f"Sol: {p_last['sol']}")
print(f"Local position: x = {p_last['x']:.2f} m, y = {p_last['y']:.2f} m")
print(f"Heightmap pixel: col = {col_last:.2f}, row = {row_last:.2f}")
print(f"World coordinates: Easting = {8140750.0 + p_last['x']:.2f} m, Northing = {-287375.0 + p_last['y']:.2f} m")
print(f"Mars Geographic: Longitude = {p_last['lon']:.6f} deg E, Latitude = {p_last['lat']:.6f} deg S")
print(f"Route elevation: {p_last['elevation']:.2f} m")
