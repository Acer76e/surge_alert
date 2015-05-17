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

	cities = []
	cities.append(downtowncore)
	cities.append(outterdowntown)
	cities.append(winterpark)
	cities.append(fullsail)
	cities.append(ucf)
	cities.append(altamonte)
	cities.append(curryford)
	cities.append(wintersprings)
	info = ''
	names = ["Orlando Downtown Core","Downtown Proper","Winter Park","Goldenrod Full Sail","UCF East Orlando","Altamonte Maitland","Curry Ford","Winter Springs"]

	for i in cities:
		payload = cities[cities.index(i)]
		headers = {'Authorization':'Token ydD_YSyQvmzZ8C5szSxeiZ-Qw4exupjar5otyuYv'}
		r = requests.get('https://api.uber.com/v1/estimates/price', params = payload, headers=headers)
		data = json.loads(r.text)
		info = info + (names[cities.index(i)]) + '    '
		info = info + (data['prices'][0]['display_name']) + '    '
		info = info + str((data['prices'][0]['surge_multiplier'])) + '  <br/><br/>'	
	return HttpResponse(info)


def db(request):

    greeting = Greeting()
    greeting.save()

    greetings = Greeting.objects.all()

    return render(request, 'db.html', {'greetings': greetings})

