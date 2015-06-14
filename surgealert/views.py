from django.shortcuts import render
from django.http import HttpResponse
import requests
import json
from .models import Greeting

# Create your views here.
def index(request):
	downtowncore = {'start_latitude':'28.542613','start_longitude':'-81.378928','end_latitude':'28.542615','end_longitude':'-81.378930'}
	outterdowntown = {'start_latitude':'28.554238','start_longitude':'-81.333994','end_latitude':'28.554240','end_longitude':'-81.333996'}
	winterpark = {'start_latitude':'28.593242','start_longitude':'-81.350645','end_latitude':'28.593245','end_longitude':'-81.350648'}
	fullsail = {'start_latitude':'28.596383','start_longitude':'-81.301328','end_latitude':'28.596385','end_longitude':'-81.301330'}
	ucf = {'start_latitude':'28.597697','start_longitude':'-81.207055','end_latitude':'28.597699','end_longitude':'-81.207058'}
	altamonte = {'start_latitude':'28.663386','start_longitude':'-81.365284','end_latitude':'28.663388','end_longitude':'-81.365286'}
	curryford = {'start_latitude':'28.515967','start_longitude':'-81.290118','end_latitude':'28.515969','end_longitude':'-81.290120'}
	wintersprings = {'start_latitude':'28.689733','start_longitude':'-81.209137','end_latitude':'28.689735','end_longitude':'-81.209139'}
        lakemarysanford = {'start_latitude':'28.756492','start_longitude':'-81.321960','end_latitude':'28.756494','end_longitude':'-81.321962'}
        pinehills = {'start_latitude':'28.578140','start_longitude':'-81.434395','end_latitude':'28.578142','end_longitude':'-81.434397'}
        metrowest ={'start_latitude':'28.538645','start_longitude':'-81.458087','end_latitude':'28.538647','end_longitude':'-81.458089'}
        ocoee ={'start_latitude':'28.573772','start_longitude':'-81.518160','end_latitude':'28.573774','end_longitude':'-81.518162'}
        holden = {'start_latitude':'28.494819','start_longitude':'-81.387818','end_latitude':'28.494821','end_longitude':'-81.387820'}
        universal = {'start_latitude':'28.489459','start_longitude':'-81.430396','end_latitude':'28.489461','end_longitude':'-81.430398'}
        disney =
{'start_latitude':'28.405047','start_longitude':'-81.577656','end_latitude':'28.405049','end_longitude':'-81.577658'}
	cities = []
	cities.append(downtowncore)
	cities.append(outterdowntown)
	cities.append(winterpark)
	cities.append(fullsail)
	cities.append(ucf)
	cities.append(altamonte)
	cities.append(curryford)
	cities.append(wintersprings)
        cities.append(lakemarysanford)
        cities.append(pinehills)
        cities.append(metrowest)
        cities.append(ocoee)
        cities.append(holden)
        cities.append(universal)
        cities.append(disney)
	info = ''
	names = ["Orlando Downtown Core","Downtown Proper","Winter Park","Goldenrod Full Sail","UCF East Orlando","Altamonte Maitland","Curry Ford","Winter Springs","Lake Mary Sanford","Pine Hills","MetroWest","Ocoee Winter Garden","Holden Belle Isle","Millenia Universal Studios","Disney Bay Lake"]

	for i in cities:
		payload = cities[cities.index(i)]
		headers = {'Authorization':'Token ydD_YSyQvmzZ8C5szSxeiZ-Qw4exupjar5otyuYv'}
		r = requests.get('https://api.uber.com/v1/estimates/price', params = payload, headers=headers)
		data = json.loads(r.text)
		info = info + (names[cities.index(i)]) + '    '
		info = info + (data['prices'][0]['display_name']) + '    '
		info = info + str((data['prices'][0]['surge_multiplier'])) + '  <tr></tr>'	
	return HttpResponse(info)


def db(request):

    greeting = Greeting()
    greeting.save()

    greetings = Greeting.objects.all()

    return render(request, 'db.html', {'greetings': greetings})

